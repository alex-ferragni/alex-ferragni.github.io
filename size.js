/* Core function that will execute the whole size measure from scratch
 *
 */
function executeCacheSearch() {

	//parameters:
	var minPower = 10;
	var maxPower = 25;


	/******* "Main" code, get parameters and launches execution *******/

	d3.select("#plots").html("");//clear previous plots, if any

	var measures = 2**7
	var nIter = 150000;
	var caches = [];

	for(var power = minPower; power <= maxPower; ++power){ //for every power of two, take measures around this power of two, see if we get an increase in slope
	
		cacheDetectionSize = 2**power;

		//first calibrate the number of accesses, such that the fastest measures takes roughly 30 cycles
		nIter = calibrateNIter(nIter, 30, function(nIter){
			return detectCache(nIter, cacheDetectionSize, 2**3, true)[0];
		});

		//then see if there is a cache here
		if (detectCache(nIter, cacheDetectionSize, measures, false)[1]){
			caches.push(2**power);
		}
	}

	console.log("Done computing. Searched for caches from "+(2**minPower)+"B to "+(2**maxPower)+"B inclusive.");
	console.log("Potential caches shown in the graphs.");
	console.log("Found "+caches.length+" caches:");
	console.log(caches);
}

/* This function tries to detect wether a cache has the given size
 *
 * nIter: number of memory accesses for a single measure
 * cacheDetectionSize: size which we are testing against
 * steps: number of different sizes that will be tested (more = more data to deal with)
 * warmup: whether this is a warmup or not (avoid some later computations if they are not needed)
 */
function detectCache(nIter, cacheDetectionSize, steps, warmup){

	if(!warmup){
		console.log("checking whether "+cacheDetectionSize+"B is the size of a cache...");
	}

	var low = cacheDetectionSize / 2; //lowest size tested
	var high = cacheDetectionSize * 1.5; //highest size tested

	var step = (high-low)/steps; //distance between two sizes tested

	var junk = 0; //varaible against DCE
	var max = 0; //additionaly, we keep track of minimum and maximum values, for the graphs and/or the calibration
	var min = 2*20;

	var results = new Array((high - low)/step); //array of measures taken

	var mainArrAccessor = new Int32Array(new ArrayBuffer(high)); //main array that will be accessed. Represents the contiguous virtual memory, contains the address set
	var accessors = new Array(high/4); //temporary array to prepare the mainArrAccessor

	//prepare an accessor array containing indexes from 0 to numWays
	//then shuffle it, it will be used to generate the order of accesses in our main array
	for (var i=0; i<low/4; ++i){
		accessors[i]=i;
	}

	shuffle(accessors, low/4);
	//use the accessor array to put correct values in our main array
	//after that, we can start by accessing i=mainArrAccessors[0], then follow the addresses contained (i = mainArrAccessor[i])
	//the accesses will then be perforemd randomly and make a loop that accesses each address once
	//this is to avoid any optimization, the browser cannot guess the next address, and they are not contiguous, so it cannot parallelize accesses or prefetch them
	//we also use the content of the array in a variable we keep and print to prevent the accesses to be optimized away

	var idx = accessors[0];

	for(var i=0; i<low/4 - 1; ++i){
		mainArrAccessor[idx] = accessors[i+1];
		idx = accessors[i+1];
	}

	mainArrAccessor[idx] = accessors[0]; //don't forget the last address should point to the first one

	//in order to avoid re-shuffling the entire array every time we increase its size, we keep track of the current max valid address in the array.
	//every time we add another address, we "insert" it randomly in the current cycle, which gives another valid cycle, and still mostly looks random
	var previousMaxIdx = low/4-1;

	for (var size = low; size < high; size+=step){

		//"insert" every address that is greater than the biggest valid address in the cycle, and update the max
		for (var i=previousMaxIdx+1; i<size/4; ++i){
			var randomIdx = Math.floor(Math.random() * (i-1))

			mainArrAccessor[i] = mainArrAccessor[randomIdx];
			mainArrAccessor[randomIdx] = i;
		}
		previousMaxIdx = size/4-1;
		

		//this is where we take the measures
		idx = 0;

		//measure the current time
		lastTick = curTick = performance.now();
        while  (lastTick == (curTick = performance.now()));
        beginTick = curTick;

        //then perform many memory accesses
		for (var i=0; i<nIter; ++i){
			idx = mainArrAccessor[idx];
			junk += idx;
		}

		//and finally measure the current time again
		endTick = performance.now();

		//add thi measure to our array
		results[(size-low)/step] = [size,endTick-beginTick];
		//then update the min and max
		if (max < endTick-beginTick){
			max = endTick-beginTick;
		}
		if (min > endTick-beginTick){
			min = endTick-beginTick;
		}

		if (!warmup){
			console.log("for size "+size+"B, time = "+(endTick-beginTick)+", junk: "+junk);
			console.log("(time per byte = "+((endTick-beginTick) / nIter)+")")
		}
		
	}

	//can we detect a cache here?
	var isCacheHere = false;
	
	if (!warmup){
		//first, compute the line under the curve (it will make the cache detection easier)
		curve = lineUnderCurve(results);

		//then try to see if it looks like there is a cache here
		isCacheHere = detectCacheSize(curve);

		if (isCacheHere){
			console.log("Cache detected! Size = "+cacheDetectionSize+"B");
			displayResults(results, null/*curve*/, null);
		}
		else{
			console.log("No cache here...");
		}

	}
	return [min,isCacheHere,junk];
}