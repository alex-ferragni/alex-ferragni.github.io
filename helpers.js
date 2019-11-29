graphId = 0;
inputCount = 1;

function getNewCacheInput(defaultFactor, defaultPower){

	var result = '<input id="factor_'+inputCount+'" type="number" min="1" max="99" value="'+defaultFactor+'" size="4"></input>'+
          '<span>*2^</span>'+
          '<input id="power_'+inputCount+'" type="number" min="10" max="24" value="'+defaultPower+'" size="4"></input>'+
          '<span>B</span>';
    inputCount++;
    return result;
}

function addCacheSize(defaultFactor, defaultPower){
	var newInput = document.createElement("div");
	newInput.className = "cacheSizeInput";
	newInput.innerHTML = getNewCacheInput(defaultFactor, defaultPower);
	document.getElementById("cacheSizeInputContainer").appendChild(newInput);
}
function removeCacheSize(){
	if (inputCount > 1){
		var div = document.getElementById("factor_"+(inputCount-1)).parentElement.remove();
		inputCount--;
	}
}
function getCacheSize(id){
	return document.getElementById("factor_"+id).value * 2**(document.getElementById("power_"+id).value);
}

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

function getArrayLastElement(a){
	return a[a.length-1];
}

function getArrayUnion(a, b){
	return [...new Set([...a, ...b])];
}

function kmeans(data, initialCenters, nIter){
	var centers = [...initialCenters];//make a copy
	//console.log(initialCenters,centers);
	//console.log(data);
	var clusterIds = new Array(data.length);
	for (var iter = 0; iter<nIter; ++iter){
		var newClusterIds = new Array(data.length);

		for (var i=0; i<data.length; ++i){
			var minDist = [2**20,-1];

			for (var j=0; j<centers.length; ++j){
				if (Math.abs(data[i] - centers[j]) < minDist[0]){
					minDist = [Math.abs(data[i] - centers[j]),j];
				}
			}
			newClusterIds[i] = minDist[1];
		}

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

		//console.log(newCenters);
		//console.log(newClusterIds);
		centers = newCenters;
		clusterIds = newClusterIds;
	}
	return clusterIds;
}

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

function lineUnderCurve(results){
	min = [-1, 2**20];
	minIndex = -1;

	for (var i=0; i<results.length; ++i){
		//console.log(min[1],results[i][1]);
		if (min[1] > results[i][1]){
			min = results[i];
			//console.log(min);
			minIndex = i;
		}
	}
	curve = [min];

	index = minIndex;
	while (index < results.length-1){
		current = results[index];
		minSlope = 2**20;
		minSlopePoint = [-1, 0];
		minSlopeIndex = -1;
		for (var i=index+1; i<results.length; ++i){
			point = results[i];

			//console.log(i, results[i]);
			if (point[0] != current[0]){
				slope = (point[1]-current[1])/(point[0]-current[0]);
			}
			else{
				slope = 2**10 + (point[1]-current[1]);
			}
			
			if (slope < minSlope){
				minSlope = slope;
				minSlopePoint = point;
				minSlopeIndex = i;
			}
			
		}

		//console.log(minSlopePoint, index);
		index = minSlopeIndex;
		curve.push(minSlopePoint);
		//console.log(index, results.length-1);
	}

	index = minIndex;
	while (index > 0){
		current = results[index];
		maxSlope = -(2**20);
		maxSlopePoint = [-1, 0];
		maxSlopeIndex = -1;
		for (var i=index-1; i>=0; --i){
			point = results[i];

			if (point[0] != current[0]){
				slope = (current[1]-point[1])/(current[0]-point[0]);
			}
			else{
				slope = -(2**10) - (point[1]-current[1]);
			}
			if (slope > maxSlope){
				maxSlope = slope;
				maxSlopePoint = point;
				maxSlopeIndex = i;
			}
		}

		//console.log(minSlopePoint, index);
		index = maxSlopeIndex;
		curve.unshift(maxSlopePoint);
		//console.log(index, results.length-1);
	}

	//console.log(curve);
	return curve;
}


function detectCacheSize(curve){
	begin = curve[0][0];
	end = curve[curve.length-1][0];

	quarter = begin + (end-begin)/4;
	thirdQuarter = begin + (end-begin)*3/4;

	indexBeforeQuarter = 0;
	indexBeforeThirdQuarter = 0;

	maxY = 0;
	minY = 2**30;

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

	alpha = ((quarter - curve[indexBeforeQuarter][0]) / (curve[indexBeforeQuarter + 1][0] - curve[indexBeforeQuarter][0]));
	interpolatedQuarter = (1 - alpha) * curve[indexBeforeQuarter][1] + alpha * curve[indexBeforeQuarter + 1][1];

	alpha = ((thirdQuarter - curve[indexBeforeThirdQuarter][0]) / (curve[indexBeforeThirdQuarter + 1][0] - curve[indexBeforeThirdQuarter][0]));
	interpolatedThirdQuarter = (1 - alpha) * curve[indexBeforeThirdQuarter][1] + alpha * curve[indexBeforeThirdQuarter + 1][1];

	//console.log(quarter,thirdQuarter);
	//console.log(interpolatedQuarter,interpolatedThirdQuarter);

	yRange = maxY - minY;
	variation = interpolatedThirdQuarter - interpolatedQuarter;

	console.log(variation,yRange);
	console.log(variation / yRange);

	threshold = 0.25;


	slopeAtQuarter = (curve[indexBeforeQuarter+1][1] - curve[indexBeforeQuarter][1]) / (curve[indexBeforeQuarter+1][0] - curve[indexBeforeQuarter][0]);
	slopeAtThirdQuarter = (curve[indexBeforeThirdQuarter+1][1] - curve[indexBeforeThirdQuarter][1]) / (curve[indexBeforeThirdQuarter+1][0] - curve[indexBeforeThirdQuarter][0]);
	if (indexBeforeQuarter == indexBeforeThirdQuarter || (variation / yRange) < threshold){
		//console.log("No cache Here.");
		return false;
	}
	else{
		//console.log("Cache detected!")
		if (slopeAtThirdQuarter * 0.7 < slopeAtQuarter){
			console.log("could be false positive!");
		}
		return true;
	}
}

function detectSteps(results){
	var averaged = new Array(results[results.length-1][0]);

	var measuresPerBucket = results.length/averaged.length;

	for (var i=0; i<averaged.length; ++i){
		averaged[i]=0;
		for (var j=0; j<measuresPerBucket; ++j){
			averaged[i] += results[i * measuresPerBucket + j][1];
		}
		averaged[i] /= measuresPerBucket;
	}

	var range = averaged[averaged.length-1] - averaged[0];

	var previous = averaged[0];

	var steps = [];
	for (var i=1; i<averaged.length; ++i){
		var current = averaged[i];
		if (current - previous >= range/10){
			if (i%2 == 0){
				steps.push(i);
			}
			else{
				steps.push(i-1);//(possibly a duplicate: TODO: solve)
				steps.push(i+1);
			}
		}
		previous = current;
	} 

	return [...new Set(steps)];
}

function displayResults(results, curve, steps){
	var max = 0;
	for (var i=0; i<results.length; ++i){
		if(results[i][1] > max){
			max = results[i][1];
		}
	}
	var div = d3.select("#plots");

	var svgId = "svg_"+graphId;
	++graphId;
	div.append("div").html('<svg id="'+svgId+'" viewBox="-20 -20 230 160" width="100%" height="80%"><style>.line {fill: none;stroke: steelblue;stroke-width: 2px;}.grid line {stroke: lightgrey;stroke-opacity: 0.7;shape-rendering: crispEdges;}.grid path {stroke-width: 0;}#text {font-size: "3";}</style></svg>');

	var scaleX = d3.scaleLinear()
		.domain([results[0][0]-1,results[results.length-1][0]])
		.range([-0,200]);

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

	var svg = d3.select("#"+svgId);

	var x_axis = d3.axisBottom()
		.scale(scaleX);
	var y_axis = d3.axisLeft()
		.scale(scaleY);

	//var yAxis = svg.axis().scale(scaleY)

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

    svg.append("g")
    	.call(x_axis)
    	.attr("transform", "translate(0, 100)")
    	.selectAll("text")
    		.attr("text-anchor", "end")
    		.attr("transform","translate(-12,7)rotate(-90)")
    		.attr("font-size","5px")

    svg.append("g")
    	.call(y_axis)
    	//.attr("transform", "translate(0, 100)")
    	.selectAll("text")
    		.attr("text-anchor", "end")
    		.attr("font-size","5px")

	svg.selectAll("circle")
		.data(results)
		.enter()
		.append("circle")
			.attr("cx",(d,i) => scaleX(d[0]))
			.attr("cy",(d,i) => scaleY(d[1]))
			.attr("r",1)
			.style("fill",(d,i) => "blue")
		

	/*svg.append("text")
    .attr("class", "x label")
    .attr("x", 20)
    .attr("y", 20)
    .attr("font-size","7px")
    .text("Time per array access");*/

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
