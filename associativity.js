/* Core function that will execute the whole associativity measure from scratch
 *
 * stride: stride parameter, distance between two addresses in the measure set, in Bytes
 */
function executeSliceSearch(stride) {

	/******* "Main" code, get parameters and launches execution *******/

	d3.select("#plots").html("");//clear previous plots, if any

	var nIter = 100000;
	var maxTries = 3000*(2**19)/stride; //maximum number of addresses we can fit in a big array, given the slice length
	var repeat = 20; //default number of times we will repeat measures


	//define a structure containing some parameters that need to change depending on the current eviction set
	//(later stages need more iterations because there is more noise)
	const Struct = (...keys) => ((...v) => keys.reduce((o, k, i) => {o[k] = v[i]; return o} , {}));
	const ParametersDescriptor = Struct("mainRepeatFactor",
										"sliceCheckRepeatFactor",
										"evictionCheckRepeatFactor",
										"enumerateRepeatFactor","enumerateFraction");

	//there are three parametersDescriprors, so it will always try to find three eviction sets (hopefully, corresponding to L1 L2 and L3)
	var parametersDescriptors = [ParametersDescriptor(1,
										  			2,
										  			1,
										 			1, 1/2),
					  			ParametersDescriptor(1,
										  			3,
										  			3,
										  			5, 3/5),
					  			ParametersDescriptor(2,
										  			4,
										  			4,
										  			10, 5/7)];

	console.log("Maximum number of addresses available: "+maxTries);

	//make sure the jit engine is ready and at constant speed by doing some dummy measurments (the warmup)
	computeAndDisplay(100000, 2**10, 8, 1, true, parametersDescriptors);

	nIter = calibrateNIter(nIter, 10, function(nIter){
		return computeAndDisplay(nIter, stride, 7, 5, true, parametersDescriptors);
	}); //first calibrate
	computeAndDisplay(nIter, stride, maxTries, repeat, false, parametersDescriptors); //then measure associativities

	console.log("Done!");
	
}


/* This function finds the id of the i-th valid address, ignoring every address marked as invalid in-between
 *
 * ways: reference to the bitmap indicating addresses we can use
 * i: index of the address we want to use
 */
function getStrideId(ways, i){
	var wayId = i;
	var realWayId = 0;

	var count = 0;
	while(count < wayId + 1 && realWayId < ways.length){ //while we haven't reached the (i+1)-th true value (and also while we are not out of bounds)
		if (ways[realWayId]){ //if this address can be used, count it
			count++;
		}
		realWayId++; //then check the next address
	}
	if (realWayId == ways.length && count < wayId + 1){ //if we are out of bounds, throw an error, we can't do any more measure
		throw Error("Error! Allocated array wasn't big enough to find all eviction sets. Try again with a bigger one if possible.");
	}
	realWayId--;
	var result = realWayId; //then convert it to an id in the main array

	return result;
}

/* this function will do the complete measures, it will look for eviction sets, and then dislpay the results
 *
 * nIter: number of memory accesses for a single measure
 * stride: stride parameter, distance between two addresses in the measure set, in Bytes
 * maxTries: maximum number of addresses we can use
 * repeat: factor to the number of times we will perform a single measure
 * warmup: whether this is a warmup or not (avoid some later computations if they are not needed)
 * parametersDescriptors: miscellaneous parameters for measures (additional factor in the number of measures in different phases, mostly)
 */
function computeAndDisplay(nIter, stride, maxTries, repeat, warmup, parametersDescriptors){

	measures = findEvictionSets(nIter, stride, maxTries, repeat, warmup, parametersDescriptors); //do the computations to find the eviction sets
	results = measures[0];
	evictionSet = measures[1];

	if (!warmup){

		displayResults(results, null, [[results.length-1],[]]); //display the first graph
		for (var i=0; i<evictionSet.length; ++i){
			displayResults(evictionSet[i], null, null); //then display the measures for each eviction set
		}
		
	}

	var min = 2**30;
	for (var i=0; i<results.length; ++i){
		if(results[i][1] < min){
			min = results[i][1];
		}
	}

	return min; //return the min for calibration reasons
}

/* This function will find two addresses, one we know is also in our eviction set, and one that is not (but is in all previous eviction sets, if any). It will then
 * measure the time taken to access the eviction set plus the positive example, and then the eviction set plus the negative example
 * this way, we have reference measures to check if later addresses are in this eviction set or not
 *
 * mainArrAccessor: reference to our big array, which contains the measure set
 * ways: addresses that can be used
 * stride: stride parameter, distance between two addresses in the measure set, in Bytes
 * evictionSetInfos: informations on our eviction set. contains [indexes of addresses in the minimum eviction set, measures taken]
 * parametersDescriptors: miscellaneous parameters for measures (additional factor in the number of measures in different phases, mostly)
 * descriptorId: id of the current parametersDescriptor
 * maxTries: maximum number of addresses we can use
 * repeat: factor to the number of times we will perform a single measure
 * nIter: number of memory accesses for a single measure
 * currentCheckThreshold: id of the last address that was checked against the last eviction set found, if any. An address that is not in a previous eviction set is ignored
 * referenceTimes: times necessary to tell whether an address is in a previous eviction set. Array of [time not in eviction set, time in eviction set]
 * evictionSets: eviction sets of caches found so far. an Eviction set is an array of address ids
 * warmup: whether this is a warmup or not (avoid some later computations if they are not needed)
 */
function computePosNegExamples(mainArrAccessor, ways, stride, evictionSetInfos, parametersDescriptors, descriptorId, maxTries, repeat, nIter, currentCheckThreshold, referenceTimes, evictionSets, warmup){

	var indices = evictionSetInfos[0]; //indexes of addresses in the minimum eviction set we detected
	var evictionSet = evictionSetInfos[1]; //measures that were taken
	console.log(indices);
	console.log(evictionSetInfos);

	if(!warmup){
		console.log("computing reference times...");
	}
	
	var posExample = getArrayLastElement(evictionSet)[0]; //the positive example is the address that caused the step
	var negExample = -1; //but we will need to find the negative example manually
	var negExampleFound = false;
	var previousIndex = 0;

	//the negative example is the any valid address that is in all previous eviction sets, but not in the new one
	//we will take the first one
	for (var i=0; i<indices.length && !negExampleFound; ++i){
		for (var j=previousIndex+1; j<indices[i] && !negExampleFound; ++j){ //forall addresses that are not in our new eviction set
			if (ways[j-1]){ //and are also valid
				negExampleFound = true; //stop here, we found a negative example
				negExample = j;
			}
		}
		previousIndex = indices[i];
	}
	if (!negExampleFound){ //if we are unlucky, our set contains exactly the minimum eviction set, then best we can do is hope the next address is not in this set
		//(but this case never happens in practice, addresses are not aligned)
		negExample = indices[indices.length-1]+1;
	}

	console.log(posExample,negExample);
	
	var tempWays = new Array(maxTries); //bitmap that will contain the minimum evictionset plus the positive/negative example
	for (var i=0; i<maxTries; ++i){
		tempWays[i] = false;
	}
	for (var i=0; i<indices.length; ++i){
		tempWays[indices[i]-1] = true;
	}

	var meanPos = 0.0;
	var meanNeg = 0.0;

	tempWays[posExample-1] = true;
	for (var count=0; count<repeat * parametersDescriptors[descriptorId].enumerateRepeatFactor*3; ++count){
		var temp = measureAccesses(mainArrAccessor, indices.length, tempWays, currentCheckThreshold, referenceTimes, evictionSets, stride, nIter, repeat, parametersDescriptors, descriptorId);
		meanPos += temp[0];
		currentCheckThreshold = temp[1];
	}
	tempWays[posExample-1] = false;
	tempWays[negExample-1] = true;
	for (var count=0; count<repeat * parametersDescriptors[descriptorId].enumerateRepeatFactor*3; ++count){
		var temp = measureAccesses(mainArrAccessor, indices.length, tempWays, currentCheckThreshold, referenceTimes, evictionSets, stride, nIter, repeat, parametersDescriptors, descriptorId);
		meanNeg += temp[0]
		currentCheckThreshold = temp[1];
	}	
	tempWays[negExample-1] = false;

	meanPos/=repeat*parametersDescriptors[descriptorId].enumerateRepeatFactor*3;
	meanNeg/=repeat*parametersDescriptors[descriptorId].enumerateRepeatFactor*3;
	//do three times as many measures, because this measure is verx important, if it is imprecise we might fail everything else after that
	if(!warmup){
		console.log("reference times: "+meanNeg+", "+meanPos);
	}

	return [[meanNeg, meanPos], currentCheckThreshold];
}

/* This function will prepare arrays content and then perform a single measure
 * ""without checking" because we know addresses have already been checked (i.e. in our eviction set)
 *
 * mainArrAccessor: reference to our big array, which contains the measure set
 * numWays: number of addresses we will access
 * ways: array of boolean values, describe addresses we can access or not 
 * stride: stride parameter, distance between two addresses in the measure set, in Bytes
 * nIter: number of memory accesses for a single measure
 */
function measureAccessesWithoutChecking(mainArrAccessor, numWays, ways, stride, nIter){
	var accessorsSize = (numWays+1)
	var accessors = new Array(accessorsSize);


	//prepare an accessor array containing indexes from 0 to numWays
	//then shuffle it, it will be used to generate the order of accesses in our main array
	for (var i=0; i<accessorsSize; ++i){
		accessors[i]=i;
	}

	shuffle(accessors, accessors.length);
	//use the accessor array to put correct values in our main array
	//after that, we can start by accessing i=mainArrAccessors[0], then follow the addresses contained (i = mainArrAccessor[i])
	//the accesses will then be perforemd randomly and make a loop that accesses each address once
	//this is to avoid any optimization, the browser cannot guess the next address, and they are not contiguous, so it cannot parallelize accesses or prefetch them
	//we also use the content of the array in a variable we keep and print to prevent the accesses to be optimized away


	mainArrAccessor[0] = getStrideId(ways, 0) * (stride/4);//just in case the first address cannnot be used, use it to redirect to the first valid address
	var idx = accessors[0];
	for(var i=0; i<accessorsSize - 1; ++i){
		mainArrAccessor[getStrideId(ways, idx) * (stride/4)]= getStrideId(ways, accessors[i+1]) * (stride/4);
		idx = accessors[i+1];
	}

	mainArrAccessor[getStrideId(ways, idx) * (stride/4)] = getStrideId(ways, accessors[0]) * (stride/4); //don't forget the last address should point to the first one
	var junk = 0; //this is the result we carry to avoid optimizations
	idx = 0;

	lastTick = curTick = performance.now();
    while  (lastTick == (curTick = performance.now())); //wait for the next rising edge
    beginTick = curTick;

    //perform accesses nIter times
	for (var i=0; i<nIter; ++i){
		idx = mainArrAccessor[idx];
		junk += idx;
	}

	endTick = performance.now(); //measure time taken

	return [endTick-beginTick, junk];

}

/* This function will prepare arrays content, check if addresses are in eviction sets if needed and then perform a single measure
 *
 * mainArrAccessor: reference to our big array, which contains the measure set
 * numWays: number of addresses we will access
 * ways_: array of boolean values, describe addresses we can access or not 
 * currentCheckThreshold: id of the last address that was checked against the last eviction set found, if any. An address that is not in a previous eviction set is ignored
 * referenceTimes: times necessary to tell whether an address is in a previous eviction set. Array of [time not in eviction set, time in eviction set]
 * evictionSets: eviction sets of caches found so far. an Eviction set is an array of address ids.
 * stride: stride parameter, distance between two addresses in the measure set, in Bytes
 * nIter: number of memory accesses for a single measure
 * repeat: factor to the number of times we will perform a single measure
 * parametersDescriptors: miscellaneous parameters for measures (additional factor in the number of measures in different phases, mostly)
 * descriptorId: id of the current parametersDescriptor
 */
function measureAccesses(mainArrAccessor, numWays, ways_, currentCheckThreshold, referenceTimes, evictionSets, stride, nIter, repeat, parametersDescriptors, descriptorId){
	var ways;
	if (!ways_){ //if ways_ is provided, use a default one
		ways = new Array(numWays+1);
		for (var i=0; i<numWays+1; ++i){
			ways[i]=true;
		}
	}
	else{ //else use the provided one
		ways = ways_;
	}

	while(getStrideId(ways, numWays) >= currentCheckThreshold){ //while the address we want to access hasn't been checked yet (checked against eviction sets found this far)
		var nextCheckIndex = getStrideId(ways, numWays);
		console.log("overflow ("+nextCheckIndex+"), need to check another address...");

		var isInvalid = false;//has a measure told us that this address should not be used because not part of our eviction sets?
		for (var j=0; j<referenceTimes.length && !isInvalid; ++j){ //forall eviction sets

			if (evictionSets[j].includes(nextCheckIndex+1)){
				//should not happen
				//this means that we found two eviction sets that are somehow independent
				//for example, the first set is an L1 eviction set, and the second one is the set of more than 4 even indexes (I've seen this happen already)
				//then, the second set may actually end BEFORE the first set, so addresses that are in the first set might be checked again
				//simply ignore this check, and continue (it is in the eviction set, therefore no need to check)
				continue;
			}

			var tempWays = new Array(ways.length); //create a temporary "ways" array containing this eviction set, plus the address we want to check
			for (var i=0; i<ways.length; ++i){
				tempWays[i]=false;
			}
			for (var i=0; i<evictionSets[j].length; ++i){
				tempWays[evictionSets[j][i]-1] = true;
			}

			tempWays[nextCheckIndex] = true;

			var meanMeasure = 0.0;

			//perform the average of many measures
			for (var i=0; i<repeat * parametersDescriptors[j].enumerateRepeatFactor; ++i){
				meanMeasure += measureAccessesWithoutChecking(mainArrAccessor, evictionSets[j].length, tempWays, stride, nIter)[0];
			}
			meanMeasure /= repeat * parametersDescriptors[j].enumerateRepeatFactor;

			//compute the threshold this value needs to reach to be considered as in our eviction set
			var threshold = referenceTimes[j][1] * parametersDescriptors[j].enumerateFraction + referenceTimes[j][0] * (1 - parametersDescriptors[j].enumerateFraction);
			console.log(meanMeasure, referenceTimes[j], threshold);

			if (meanMeasure <= threshold){ //in the "fast" group, not in our eviction set, don't use this address
				isInvalid = true;
			}

			tempWays[nextCheckIndex] = false;
		}

		if (isInvalid){ //in the "fast" group, not in our eviction set, don't use this address
			ways[getStrideId(ways, numWays)] = false; //set it to false, it won't be used anymore
			currentCheckThreshold = getStrideId(ways, numWays); //next time we will need to check the next true index   
		}
		else{ //it is in this eviction set! don't set it to false, indicate that we checked this address
			currentCheckThreshold = getStrideId(ways, numWays) + 1; //just make sure we don't check this address more than once, but that we check every single address after this one
		}
		
	}

	//now, we know the addresses have been checked, simply perform the measures
	return [measureAccessesWithoutChecking(mainArrAccessor, numWays, ways, stride, nIter)[0], currentCheckThreshold];
}

/* This function will try to distinguish the eviction set, assuming we detected a valid step
 *
 * ways: addresses that can be used
 * evictionSetSize: number of addresses in our current step, which should also contains the eviction set
 * parametersDescriptors: miscellaneous parameters for measures (additional factor in the number of measures in different phases, mostly)
 * descriptorId: id of the current parametersDescriptor
 * repeat: factor to the number of times we will perform a single measure
 * mainArrAccessor: reference to our big array, which contains the measure set
 * referenceTimes: times necessary to tell whether an address is in a previous eviction set. Array of [time not in eviction set, time in eviction set]
 * evictionSets: eviction sets of caches found so far. an Eviction set is an array of address ids.
 * stride: stride parameter, distance between two addresses in the measure set, in Bytes
 * nIter: number of memory accesses for a single measure
 * currentCheckThreshold: id of the last address that was checked against the last eviction set found, if any. An address that is not in a previous eviction set is ignored
 */
function separateEvictionSet(ways, evictionSetSize, parametersDescriptors, descriptorId, repeat, mainArrAccessor, referenceTimes, evictionSets, stride, nIter, currentCheckThreshold){ 

	var countTrue = 0;
	var countFalse = 0;
	var evictionSetTemp = []; //we keep track of measures
	var minTime = 2**20;
	var maxTime = 0;

	while(countTrue < evictionSetSize+1){
		if(ways[countTrue + countFalse]){
			countTrue++;
		}
		else{
			countFalse++;
		}
	}
	var lastTrueIndex = countTrue + countFalse -1;//index of the address that provoqued the "step" detected

	var numRepeat = repeat * parametersDescriptors[descriptorId].evictionCheckRepeatFactor;

	if (evictionSetSize > 25){ //if we work with a lot of addresses, the time difference between eviction set and other addresses is reduced, so we do more measures to have enough precision
		numRepeat *= (1 + evictionSetSize/25);
		numRepeat = Math.floor(numRepeat);
	}

	for (var i=0; i<lastTrueIndex+1; ++i){
		if (ways[i]){ //forall addresses in our set
			//temporarily disable this address, measure the time taken to access the other addresses, then reactivate it
			ways[i]=false; 

			var meanTime=0.0;
			for (var count=0; count<numRepeat; ++count){
				var temp = measureAccesses(mainArrAccessor, evictionSetSize-1, ways, currentCheckThreshold, referenceTimes, evictionSets, stride, nIter, repeat, parametersDescriptors, descriptorId);
				meanTime += temp[0];
				currentCheckThreshold = temp[1];
			}

			meanTime /= numRepeat;
			console.log("result ("+i+"): "+meanTime);

			ways[i]=true;
			evictionSetTemp.push([i+1, meanTime]);
			if (meanTime < minTime){
				minTime = meanTime;
			}
			if (meanTime > maxTime){
				maxTime = meanTime;
			}
		}
	}

	var indices = getLowerClusterKMeans(evictionSetTemp, minTime, maxTime); //now that we have the measures, use kmeans to detect lower and upper clusters
	return [[indices, evictionSetTemp], currentCheckThreshold]; //return indices of the eviction set and additional measures
}

/* this function will do the complete measures, it will look for eviction sets, given additional parameters and the fact that a warmup has been done
 *
 * nIter: number of memory accesses for a single measure
 * stride: stride parameter, distance between two addresses in the measure set, in Bytes
 * maxTries: maximum number of addresses we can use
 * repeat: factor to the number of times we will perform a single measure
 * warmup: whether this is a warmup or not (avoid some later computations if they are not needed)
 * parametersDescriptors: miscellaneous parameters for measures (additional factor in the number of measures in different phases, mostly)
 */
function findEvictionSets(nIter, stride, maxTries, repeat, warmup, parametersDescriptors){
	var junk = 0;//keep some value and print it to avoid optimisations

	var results = new Array(maxTries * repeat); //array that will contain times measured
		
	var maxSize = stride * maxTries; //total size of our array
	var mainArrAccessor = new Int32Array(new ArrayBuffer(maxSize)); //so that each index maps to a 32 bytes integer, and not a byte

	var referenceTimes = []; //will be needed to determine whether an address is in a previous eviction set or not
	var addressesChecked = new Array(maxTries); //boolean array to remove addresses that maps to other sets from the set of addresses we will access
	var currentCheckThreshold = maxTries; //if we access a value with index greater or equal to this value, we should first check whether it falls in previous eviction sets or not
	var evictionSets = []; //to keep track of eviction sets

	for (var i=0; i<maxTries; ++i){
		addressesChecked[i] = true;
	}

	//initialize the bitmap describing addresses we can use, initially all set to true
	var ways = new Array(maxTries);
	for (var i=0; i<ways.length; ++i){
		ways[i]=true;
	}


	var initialGraphMax = 0; //for graph reasons, we keep track of the maximum measure in the first phase (setp finding)
	var evictionSetResults = []; //for graph reasons, we keep track of measures in the second phase, when we try to distinguish the eviction set

	for (var descriptorId=0; descriptorId < parametersDescriptors.length; ++descriptorId){
		var enumerationDone = false; //for later use
		initialGraphMax = 0; //we only want the graph of the last eviction set, so reset the max x value

		var previousMean = null; //used to detect a sudden increase in the mean
		var minEvictionSize = maxTries-1; //size of the first eviction set we find, if any
		var shouldStop = false; //have we detected the eviction set yet? then we should stop

		var evictionSetInfos = []; //we keep track of the measures of this eviction set, for later use
		var posNegTimes = []; //we keep track of the times against which we will compare measures to determine whether addresses are in previous eviction sets or not, to filter them

		for (var numWays = 0; numWays < maxTries && !shouldStop; ++numWays){ //for all number of addresses where we could detect a step, and while we haven't found one

			if (!warmup){
				printSummary(evictionSets, referenceTimes);
			}
			
			var currentMean = 0.0;

			//take the measures a certain number of times
			var numRepeat = repeat * parametersDescriptors[descriptorId].mainRepeatFactor;

			if (numWays > 10){ //if we work with a lot of addresses, the time difference between eviction set and other addresses is reduced, so we do more measures to have enough precision
				numRepeat *= (1 + numWays/10 * 0.2); //20% slower every 10 addresses, because we may need more precision there
				numRepeat = Math.floor(numRepeat);
			}
			for (var count = 0; count<numRepeat; ++count){
				var temp = measureAccesses(mainArrAccessor, numWays, ways, currentCheckThreshold, referenceTimes, evictionSets, stride, nIter, repeat, parametersDescriptors, descriptorId);
				var measures = temp[0];
				currentCheckThreshold = temp[1];

				results[numWays*repeat + count] = [numWays+1,measures]; //results may spill but it will be overwritten anyway

				currentMean += measures;
			}

			currentMean /= numRepeat;

			if (!warmup){ //print some infos
				console.log("for "+(numWays+1)+" ways, mean time = "+currentMean);
			}

			// if we detected a step in the time function
			if (!warmup && previousMean && previousMean * (1+0.7/numWays) < currentMean){

				//we have detected a step in the time function, now we need to check whether it is caused by a new eviction set, or not
				//(it could for example be caused by the TLB, or the associativity of a previous cache)
				//the difference which would indicate a step caused by a new eviction set is that if we replace the last accessed address by another one, it is 
				//possible that the step dissapear, which would indicate that some values cause a step while other don't (so it is really an eviction set)

				var waysUpdates = []; //we may invalidate some addresses to check the step, so we keep track of them to reset them afterwards
				var maxMeasure = 0;
				var minMeasure = 2**20;
				var lastTrueIndex = 0;
				var countTrue = 0;
				var countFalse = 0;
				while(countTrue < numWays+1){
					if(ways[countTrue + countFalse]){
						countTrue++;
					}
					else{
						countFalse++;
					}
				}
				lastTrueIndex = countTrue + countFalse -1; //index of the address that caused the step

				ways[lastTrueIndex] = false;
				waysUpdates.push(lastTrueIndex);
				console.log("checking whether this step is caused by a slice... (threshold used = "+(1+1.5/numWays)+"x)");
				console.log((previousMean*(1+1.5/numWays)), currentMean)
				//note: we use a threshold that depends on the number of addresses we are accessing. The bigger the set, the smaller the step

				//any step that is before the addresses we checked previously cannot be a valid eviction set, we can safely assume it is not a valide step
				if (evictionSets.length >= 1 && lastTrueIndex <= getArrayLastElement(getArrayLastElement(evictionSets))){
					console.log("It cannot be, it is contained within the previous eviction set, continuing...");
				}
				else{
					//we will replace the last address by every consecutive address, until a threshold that depends on the size of the set
					//the bigger the set is, the more addresses we could need to find a good example
					for (var i=0; i<numWays/2; ++i){

						var numRepeat = repeat * parametersDescriptors[descriptorId].sliceCheckRepeatFactor;

						if (numWays > 10){ //if we work with a lot of addresses, the time difference between eviction set and other addresses is reduced, so we do more measures to have enough precision
							numRepeat *= (1 + numWays/10 * 0.2); //20% slower every 10 addresses, because we may need more precision there
							numRepeat = Math.floor(numRepeat);
						}

						var otherMean = 0.0;
						for (var count = 0; count<numRepeat; ++count){
							var temp = measureAccesses(mainArrAccessor, numWays, ways, currentCheckThreshold, referenceTimes, evictionSets, stride, nIter, repeat, parametersDescriptors, descriptorId);
							var measures = temp[0];
							currentCheckThreshold = temp[1];
							var time = measures;

							otherMean += time;
							
						}
						otherMean /= numRepeat;


						if (otherMean < minMeasure){
							minMeasure = otherMean;
						}
						if (otherMean > maxMeasure){
							maxMeasure = otherMean;
						}
						console.log(otherMean, minMeasure, maxMeasure);

						if (maxMeasure - minMeasure > minMeasure * (1.5/numWays)){ //if the difference between two measures is big enough, stop checking here, we might have a valid step
							break;
						}

						lastTrueIndex++;
						while(!ways[lastTrueIndex]){
							lastTrueIndex++;
						}

						//find last true value of ways that fits in our set
						//store its id, set it to false
						ways[lastTrueIndex] = false;
						waysUpdates.push(lastTrueIndex);
					}
					//restore previous state
					for (var i=0; i<waysUpdates.length; ++i){
						ways[waysUpdates[i]] = true;
					}
					
					//if we found a big enough difference
					if (maxMeasure - minMeasure > minMeasure * (1.5/numWays)){
						if (!warmup){ //print a quick summary
							printSummary(evictionSets, referenceTimes);
						}
						

						console.log("It may be! ("+otherMean+" vs ["+minMeasure+"-"+maxMeasure+"]) verifying...");

						//now, this step might be real, but it might still be caused by noise. Try to find the minimum eviction set twice, and if results are not similar,
						//we know it wasn't a valid step and we should not consider it

						var temp = separateEvictionSet(ways, numWays, parametersDescriptors, descriptorId, repeat, mainArrAccessor, referenceTimes, evictionSets, stride, nIter, currentCheckThreshold); //try to find the minimum eviction set
						evictionSetInfos = temp[0];
						currentCheckThreshold = temp[1];

						console.log("reference:");
						console.log(evictionSetInfos[0]);
						var isFalsePositive = false; //if it is a false positive, we won't consider this step

						for (var i=0; i<1 && !isFalsePositive; ++i){ //for now, only do it once more, but we could chose to do more than two tries later
							var temp = separateEvictionSet(ways, numWays, parametersDescriptors, descriptorId, repeat, mainArrAccessor, referenceTimes, evictionSets, stride, nIter, currentCheckThreshold);
							var otherResults = temp[0];
							currentCheckThreshold = temp[1];

							console.log("otherMeasure:");
							console.log(otherResults[0]);
							if (!areArraySimilar(evictionSetInfos[0],otherResults[0], 0.5)){ //if two results are not similar enough
								isFalsePositive = true; 
							}
							else{
								//the two results are very similar, take the union of the two set of indexes as minimal eviction set, an address might have been missed in one or another
								//it is still relatively safe to take too many addresses, as long as we don't take enough to fill another eviciton set (which is very improbable)
								//on the other side, it is sufficient to not consider a single valid address in our eviction set to invalidate every measures taken from this point,
								//so we do not take the risk of missing one...
								evictionSetInfos[0] = getArrayUnion(evictionSetInfos[0], otherResults[0]);
								evictionSetInfos[0].sort((a, b) => a - b);
							}
						}

						if (isFalsePositive){
							console.log("It is still not, continuing...");
						}
						else{
							//if it wasn't a false positive, we did enough checks to be fairly sure we found a new eviction set! There is still a last possible check though
							//compute reference times for later filtration
							var temp = computePosNegExamples(mainArrAccessor, ways, stride, evictionSetInfos, parametersDescriptors, descriptorId, maxTries, repeat, nIter, currentCheckThreshold, referenceTimes, evictionSets, warmup);
							posNegTimes = temp[0];
							currentCheckThreshold = temp[1];

							//"spilling" the eviction set should lead to a significant increase in time taken, make sure it is the case
							//otherwise we detected a set of addresses that are faster to access than others, but that do not consitute an eviction set
							if (posNegTimes[0] * 1.10 < posNegTimes[1]){

								if (referenceTimes.length == 0 || getArrayLastElement(referenceTimes)[1] < posNegTimes[1]){ //we also require the positive example to be greater than the previous one
									//a miss from a higher cache should always be slower!

									//we did all we could, it should really be a new eviction set now
									console.log("It is!");
									console.log(evictionSetInfos);
									console.log(evictionSetInfos[0]);


									shouldStop = true; //indicate that we found it, we can stop now
									minEvictionSize = numWays;
								}
								else{
									console.log("found an eviction set, but does not correspond to a cache. May be a TLB set, continuing...");
								}
							}
							else{
								console.log("no significative gap detected, continuing...");
							}
						}
					}
					else{
						console.log("It is not, continuing...");
					}
					
				}

				
			}
			previousMean = currentMean; //update previous mean
		}
		initialGraphMax = minEvictionSize;

		if (!minEvictionSize && !warmup){ //should never happen, it should crash while looking for another index first
			console.log("Error! did not find the minimum eviction set size.");
		}


		if (!warmup){

			var indices = evictionSetInfos[0];
			var evictionSet = evictionSetInfos[1];

			//update ways with the newly found eviction set
			//only keep values that are in this eviction set so far, and indicate that some values
			//must be checked again (so that if they are not in this new evictions set, we won't use them anymore)
			for (var i=0; i<getArrayLastElement(evictionSet)[0]-1; ++i){
				ways[i] = false;
			}
			for (var i=0; i<indices.length; ++i){
				ways[indices[i]-1] = true;
			}
			currentCheckThreshold = getArrayLastElement(evictionSet)[0]-1; //we have only checked addresses until the end of our minimal eviction set
			console.log(currentCheckThreshold);
			//console.log(ways);
			console.log(evictionSets);

			evictionSetResults.push(evictionSet); //keep results for the graphs

			evictionSets.push(indices); //keep track of the newly found eviction set
			referenceTimes.push(posNegTimes);
		}
		
	}

	//return values needed to show graphs
	return [results.slice(0,(initialGraphMax+1)*repeat), evictionSetResults];
	
}