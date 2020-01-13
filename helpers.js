graphId = 0; //keep a global graph counter to use different ids for each

/* 
 * Randomly shuffle an array a of size length
 */
function shuffle(a, length) {
    var j, x, i;
    for (i = length - 1; i > 0; i--) {
        j = Math.floor(Math.random() * (i + 1));
        x = a[i];
        a[i] = a[j];
        a[j] = x;
    }
    return a;
}

/* 
 * Checks whether two arrays are equal. They are different if their sizes don't match, or if any element differ
 */
function areArrayEqual(a, b){
	if (a.length != b.length){
		return false;
	}
	for (var i=0; i<a.length; ++i){
		if (a[i] != b[i]){
			return false;
		}
	}
	return true;
}

/* 
 * Checks whether two arrays are similar. The result corresponds to the Jaccard Index (https://en.wikipedia.org/wiki/Jaccard_index)
 */
function areArraySimilar(a, b, similarity){
	var union = getArrayUnion(a, b);
	var similarCount = 0;
	for (var i=0; i<union.length; ++i){
		if (a.includes(union[i]) && b.includes(union[i])){
			similarCount++;
		}
	}
	return (similarCount/union.length >= similarity);
}

/*
 * Simple helper function to return last array element. Helpful when the array name is long, or some computations must be done to get its reference, since it appears twice here
 */
function getArrayLastElement(a){
	return a[a.length-1];
}

/*
 * Return the union of two arrays. Notice the new order might be random
 */
function getArrayUnion(a, b){
	return [...new Set([...a, ...b])];
}

/*
 * Perform 1d kmeans on the data input. Data should be an array of integers. InitialCenters specifies the initial cluster centers.
 * In this simple version, a constant number of iterations (nIter) are always performed
 */
function kmeans(data, initialCenters, nIter){
	var centers = [...initialCenters];//make a copy

	var clusterIds = new Array(data.length); //for each point, the id of the assigned cluster
	for (var iter = 0; iter<nIter; ++iter){
		var newClusterIds = new Array(data.length);

		//reassigne points to the nearest cluster center
		for (var i=0; i<data.length; ++i){
			var minDist = [2**20,-1];

			for (var j=0; j<centers.length; ++j){
				if (Math.abs(data[i] - centers[j]) < minDist[0]){
					minDist = [Math.abs(data[i] - centers[j]),j];
				}
			}
			newClusterIds[i] = minDist[1];
		}

		//then recompute cluster centers
		var newCenters = new Array(initialCenters.length);
		var count = new Array(initialCenters.length);
		for (var i=0; i<newCenters.length; ++i){
			newCenters[i] = 0;
			count[i] = 0;
		}
		for (var i=0; i<data.length; ++i){
			newCenters[newClusterIds[i]] += data[i];
			count[newClusterIds[i]]++;
		}

		for (var i=0; i<newCenters.length; ++i){
			newCenters[i] /= count[i];
		}

		centers = newCenters;
		clusterIds = newClusterIds;
	}
	return clusterIds;
}

/*
 * Helper function. Runs a kmeans algorithm with two clusters on the given measures, and then return only the ids of the measures of the lowest cluster
 */
function getLowerClusterKMeans(measures, min, max){
	var points = new Array(measures.length);

	for (var i=0; i<measures.length; ++i){
		points[i] = measures[i][1];
	}
	clusterIds = kmeans(points, [min,(min+max)/2], 10);
	var lowerClusterIndices = [];
	for (var i=0; i<clusterIds.length-1; ++i){
		if (clusterIds[i] == 0){
			lowerClusterIndices.push(measures[i][0]);
		}
	}
	return lowerClusterIndices;
}

/*
 * this functions will calibrate the number of memory accesses that are executed for a single measure
 * it does so by making sure that the quickest measure we make is around 10-30 cycles long (parametrized by "objective"), which is a good base time
 * taking a measure is done by calling the function "performMeasuresWithNIter" with as only parameter the current number of iterations
 * performMeasuresWithNIter should return the minimum measure that was taken
 */
function calibrateNIter(initialNIter, objective, performMeasuresWithNIter){
	console.log("calibrating...");
	var nIter = initialNIter;
	var minCalibrate = 0;
	var done = false; //e.g. are we done calibrating yet, have we reached the objective?
	do{
		minCalibrate = performMeasuresWithNIter(nIter);
		console.log(minCalibrate)
		if (minCalibrate < objective){
			nIter *= 2;
		}
		else if (minCalibrate >= objective){
			nIter = nIter * (objective/minCalibrate);
			nIter = Math.floor(nIter);
			done = true;
		}
	}
	while(!done);
	
	console.log("done calibrating! Chose "+nIter+" iterations.");
	return nIter;
}

/*
 * Print a quick summary of the eviction sets found so far (if any), in case the console loses the first messages.
 * format:
 * "summary of eviction sets found: [[ids of addresses in this eviction set] (eviction set length, accessTimes: [negative reference time, positive reference time])]"
 * where reference time represent the time necessary to access the entire eviction set plus a single point, which does / does not belong to this eviction set
 */
function printSummary(evictionSets, referenceTimes){
	var summary = "summary of eviction sets found: ";
	for (var i=0; i<evictionSets.length; ++i){
		summary += "[";
		for (var j=0; j<evictionSets[i].length; ++j){
			summary += evictionSets[i][j];
			if (j != evictionSets[i].length-1){
				summary += ", ";
			}
		}
		summary += "] (";
		summary += evictionSets[i].length+", accessTimes: [";

		for (var j=0; j<referenceTimes[i].length; ++j){
			summary += referenceTimes[i][j];
			if (j != referenceTimes[i].length-1){
				summary += ", ";
			}
		}

		summary += "])";
	}
	console.log(summary);
}

/*
 * Computes the "line" under the given curve. Imagine we took a string, hold it below the curve, and highered both ends, then we got the line under the curve.
 * results is an array of [x,y] points, sorted by increasing x value.
 * returns the line under the curve (array of [x,y] points corresponding to the line under the curve])
 */
function lineUnderCurve(results){
	//we start by finding the minimum point in the curve. We know it will be included in the line under the curve
	min = [-1, 2**20];
	minIndex = -1;

	for (var i=0; i<results.length; ++i){
		if (min[1] > results[i][1]){
			min = results[i];
			minIndex = i;
		}
	}
	curve = [min]; 

	//now, iteratively find the other points in the line under the curve, first right, then left.
	//We do it by taking the right-most point in our current line, and add the point to its right that has the lowest slope. Repeat until we reached the right-most data point, 
	//which will automatically belong to this line
	index = minIndex;
	while (index < results.length-1){
		current = results[index];
		minSlope = 2**20; //the minimum slope to the right found so far
		minSlopePoint = [-1, 0]; //the point corresponding to this point
		minSlopeIndex = -1; //and its index
		for (var i=index+1; i<results.length; ++i){
			point = results[i];

			if (point[0] != current[0]){ // if the current x point is different, simply compute the slope
				slope = (point[1]-current[1])/(point[0]-current[0]);
			}
			else{ //if they are the same, slope would be infinite => set to very large slope, that depends from y difference (to only keep the highest point on the same x value)
				slope = 2**10 + (point[1]-current[1]);
			}
			
			if (slope < minSlope){
				minSlope = slope;
				minSlopePoint = point;
				minSlopeIndex = i;
			}
			
		}

		index = minSlopeIndex; //update the current index, so that on the next iteration, either we stop or we check less points (to the right of index)
		curve.push(minSlopePoint); //finally, add this point to line
	}

	//repeat the procedure, this time looking for the left part of the graph (note: we look for the maximum slope this time! The one that decreases the least)
	index = minIndex;
	while (index > 0){
		current = results[index];
		maxSlope = -(2**20); //the maximum slope to the right found so far
		maxSlopePoint = [-1, 0]; //the point corresponding to this point
		maxSlopeIndex = -1; //and its index
		for (var i=index-1; i>=0; --i){
			point = results[i];

			if (point[0] != current[0]){ // if the current x point is different, simply compute the slope
				slope = (current[1]-point[1])/(current[0]-point[0]);
			}
			else{ //if they are the same, slope would be -infinite => set to very large negative slope, that depends from y difference (to only keep the highest point on the same x value)
				slope = -(2**10) - (point[1]-current[1]);
			}
			if (slope > maxSlope){
				maxSlope = slope;
				maxSlopePoint = point;
				maxSlopeIndex = i;
			}
		}

		index = maxSlopeIndex; //update the current index, so that on the next iteration, either we stop or we check less points (to the left of index)
		curve.unshift(maxSlopePoint); //finally, add this point to line (at the beginning of the line!)
	}

	return curve;
}

/*
 * Given the line under a curve ("curve"), try to tell whether there is a sharp enough, significant enough increase in the slope
 * curve should be an array of [x,y] points
 * (which would correspond to a cache size being detected)
 * But it should only detect "sharp enough" changes, which in practice is fairly hard
 * The current method is to compate the slopes at 1/4 and 3/4 of the curve, we expect one to be larger than the other (we need to take the y scale into account!)
 * We also compare the y value of the graph at 1/4 and 3/4 of the graph, we expect them to be different (even if the slope increased, if the graph remains fairly flat,
 * no cache size should be detected)
 * we also (sanity) check that the line between 1/4 and 3/4 isn't continuous, since there would be no increase
 */
function detectCacheSize(curve){
	begin = curve[0][0];
	end = curve[curve.length-1][0];

	quarter = begin + (end-begin)/4; //x value at one quarter of the graph
	thirdQuarter = begin + (end-begin)*3/4; //x value at three quarters of the graph

	indexBeforeQuarter = 0;
	indexBeforeThirdQuarter = 0;

	maxY = 0; //keep track of max and min y values, to check that the difference bewteen 1/4 and 3/4 is significant enough
	minY = 2**30;

	//first, find the indexes of points right before a quarter and three quarters (we will need them to find the slopes)
	for(var i=0; i<curve.length; ++i){
		if (curve[i][0] < quarter){
			indexBeforeQuarter = i;
		}
		if (curve[i][0] < thirdQuarter){
			indexBeforeThirdQuarter = i;
		}

		if (curve[i][1] < minY){
			minY = curve[i][1];
		}
		if (curve[i][1] > maxY){
			maxY = curve[i][1];
		}
	}

	//use linear interpolation to compute y value at exactly one quarter
	alpha = ((quarter - curve[indexBeforeQuarter][0]) / (curve[indexBeforeQuarter + 1][0] - curve[indexBeforeQuarter][0]));
	interpolatedQuarter = (1 - alpha) * curve[indexBeforeQuarter][1] + alpha * curve[indexBeforeQuarter + 1][1];

	//use linear interpolation to compute y value at exactly three quarters
	alpha = ((thirdQuarter - curve[indexBeforeThirdQuarter][0]) / (curve[indexBeforeThirdQuarter + 1][0] - curve[indexBeforeThirdQuarter][0]));
	interpolatedThirdQuarter = (1 - alpha) * curve[indexBeforeThirdQuarter][1] + alpha * curve[indexBeforeThirdQuarter + 1][1];

	yRange = maxY - minY;
	variation = interpolatedThirdQuarter - interpolatedQuarter;

	console.log(variation,yRange);
	console.log(variation / yRange);

	threshold = 0.25;
	//check that between the y value at one quarter and the y value at three quarters, there is at least 25% of the y scale contained

	//compute the slopes at one quarter and three quarters
	slopeAtQuarter = (curve[indexBeforeQuarter+1][1] - curve[indexBeforeQuarter][1]) / (curve[indexBeforeQuarter+1][0] - curve[indexBeforeQuarter][0]);
	slopeAtThirdQuarter = (curve[indexBeforeThirdQuarter+1][1] - curve[indexBeforeThirdQuarter][1]) / (curve[indexBeforeThirdQuarter+1][0] - curve[indexBeforeThirdQuarter][0]);

	//if the line between 1/4 and 3/4 is continuous, or the graph didn't increase much in between, then there is no cache detected
	if (indexBeforeQuarter == indexBeforeThirdQuarter || (variation / yRange) < threshold){
		return false;
	}
	else{
		//else, check that the slope increase enough
		//(we don't use that in practice because it yields more incorrect results thatn the current version)
		if (slopeAtThirdQuarter * 0.7 < slopeAtQuarter){
			console.log("could be false positive!");
		}
		return true;
	}
}

/*
 * Use d3 to plot an interesting graph. Graphs are an array of [x,y] points.
 * if curve != null, display it on the graph as well (it is the line under the curve)
 * curve should be an array of [x,y] points.
 * if steps != null, display corresponding vertical lines (either green or ref)
 * steps should be an array of [array of green lines, array of red lines]
 * where a "line" is an x value
 */
function displayResults(results, curve, steps){
	var max = 0; //keep track of the maximum y value, for the scales
	for (var i=0; i<results.length; ++i){
		if(results[i][1] > max){
			max = results[i][1];
		}
	}
	var div = d3.select("#plots");

	var svgId = "svg_"+graphId;
	++graphId;
	//append a new default svg div
	div.append("div").html('<svg id="'+svgId+'" viewBox="-20 -20 230 160" width="100%" height="80%"><style>.line {fill: none;stroke: steelblue;stroke-width: 2px;}.grid line {stroke: lightgrey;stroke-opacity: 0.7;shape-rendering: crispEdges;}.grid path {stroke-width: 0;}#text {font-size: "3";}</style></svg>');

	//x scale
	var scaleX = d3.scaleLinear()
		.domain([results[0][0]-1,results[results.length-1][0]])
		.range([0,200]);

	//y scale
	var scaleY = d3.scaleLinear()
		.domain([0,max])
		.range([100,0])

	// gridlines in x axis function
	function make_x_gridlines() {		
	    return d3.axisBottom(scaleX)
	        .ticks(10)
	}

	// gridlines in y axis function
	function make_y_gridlines() {		
	    return d3.axisLeft(scaleY)
	        .ticks(10)
	}

	//select current svg with its id
	var svg = d3.select("#"+svgId);

	var x_axis = d3.axisBottom()
		.scale(scaleX);
	var y_axis = d3.axisLeft()
		.scale(scaleY);

	// add the X gridlines
	svg.append("g")			
	  .attr("class", "grid")
	  .attr("transform", "translate(0," + 100 + ")")
	  .call(make_x_gridlines()
	      .tickSize(-100)
	      .tickFormat("")
	  )

	// add the Y gridlines
	svg.append("g")			
	  .attr("class", "grid")
	  .call(make_y_gridlines()
	      .tickSize(-200)
	      .tickFormat("")
	  )

	// set x axis parameters
    svg.append("g")
    	.call(x_axis)
    	.attr("transform", "translate(0, 100)")
    	.selectAll("text")
    		.attr("text-anchor", "end")
    		.attr("transform","translate(-12,7)rotate(-90)")
    		.attr("font-size","5px")

	// set y axis parameters
    svg.append("g")
    	.call(y_axis)
    	.selectAll("text")
    		.attr("text-anchor", "end")
    		.attr("font-size","5px")

	//set data (the points) parameters
	svg.selectAll("circle")
		.data(results)
		.enter()
		.append("circle")
			.attr("cx",(d,i) => scaleX(d[0]))
			.attr("cy",(d,i) => scaleY(d[1]))
			.attr("r",1)
			.style("fill",(d,i) => "blue")
		

	//if one is provided, display the given curve
    if (curve != null){
    	var lineGenerator = d3.line()
		.x(function(d) { return scaleX(d[0]); })
		.y(function(d) { return scaleY(d[1]); });
		var pathString = lineGenerator(curve);
		svg.append('path')
			.attr('d', pathString)
			.attr("stroke", "black")
			.attr("stroke-width", 1)
			.attr("fill", "none");
    }

    //if some are provided, display the green and red vertical lines given
    if (steps != null){
    	for (var i=0; i<steps[0].length; ++i){
			svg.append("line")
				.attr("x1", scaleX(0.5+steps[0][i]))
				.attr("y1", scaleY(0))
				.attr("x2", scaleX(0.5+steps[0][i]))
				.attr("y2", scaleY(max))
				.style("stroke-width", 1)
				.style("stroke", "green")
				.style("fill", "none");
    	}
    	for (var i=0; i<steps[1].length; ++i){
			svg.append("line")
				.attr("x1", scaleX(0.5+steps[1][i]))
				.attr("y1", scaleY(0))
				.attr("x2", scaleX(0.5+steps[1][i]))
				.attr("y2", scaleY(max))
				.style("stroke-width", 1)
				.style("stroke", "red")
				.style("fill", "none");
    	}
    }
	

}
