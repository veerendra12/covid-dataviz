const ANIMATION_INTERVAL = 5;
const EVENT_PAUSE_INTERVAL = 2500;
const ONE_DAY = 60 * 60 * 24 * 1000;
const TOP_FIVE_STATE_CODES = ['NY', 'CA', 'TX', 'FL', 'AZ', '_OthersTop5'];

const DATA_STATE_CODES = "data/state_codes.csv";
const DATA_STATE_CONFIRMED_CASES = "data/usa_state_covid_confirmed_cases_stats.csv";
const DATA_STATE_NEWCASES_ROLLING_AVG_EVENTS = "data/usa_state_newcases_rolling_avg_events.json";
const DATA_STATE_DEATHS = "data/usa_state_covid_deaths_stats.csv";
const DATA_STATE_DEATHS_ROLLING_AVG_EVENTS = "data/usa_state_deaths_rolling_avg_events.json";
const DATA_STATE_COLORS = "data/state-colors.json";
const DATA_IDS = "data/Ids.json";

// Dimensions are computed based on the screen and browser window size at the time of page rendering
var Dims = {
    MainSvg : {
        Width: -1,
        Height: -1
    },
    MainSvgChart : {
        Width: -1,
        Height: -1       
    },
    LegendChart : {
        Width : -1,
        Height : 150
    },
    EventsChart : {
        Width : 450,
        Height : 800
    },
    Margin : {
        Top: 100, 
        Bottom: 50, 
        Left: 50, 
        Right: 50
    },
    NavigationBox : {
        Width: 140,
        Height: 20
    }
};

var Scales = {};
var Generators = {};

var timeParser = d3.timeParse("%m/%d/%y");
var timeFormatter = d3.timeFormat("%m/%d/%y");
var dateMonthTimeFormatter = d3.timeFormat("%d %b");
var timeFormatterHyphen = d3.timeFormat("%m-%d-%y");

var casesRange;
var totalTimeLineRange = [timeParser("01/01/20"), timeParser("07/22/20")];
var dataTimeLineRange = [timeParser("01/22/20"), timeParser("07/22/20")];
var totalTimeLineNumDays = (totalTimeLineRange[1] - totalTimeLineRange[0]) / ONE_DAY + 1;
var IDs;
var timer;

var dataUSTopJson;
var stateCodesMap;
var dataDatewiseStateCases;
var dataStateEvents;
var dataStateCodes;
var dataStateConfirmedCasesDateNested = {};
var dataDateRange;
var currDate;
var dataAggregationLevel = 'AllStates';

var allStatesStackedData;

var colors;
var allStateAndCountryData;
var currChartKeys;

computeDims();

setLayoutSizings();

d3.select("div.tooltip").style("opacity", 0);

var mode = getMode();
var casesDataFile = (mode == 'deaths') ? DATA_STATE_DEATHS : DATA_STATE_CONFIRMED_CASES;
var caseEventsDataFile = (mode == 'deaths') ? DATA_STATE_DEATHS_ROLLING_AVG_EVENTS : DATA_STATE_NEWCASES_ROLLING_AVG_EVENTS;

Promise.all([d3.csv(DATA_STATE_CODES),
             d3.csv(casesDataFile, function (d) {
                 d.Date = timeParser(d.Date);
                 d.Count = +d.Count;
                 d.NewCount = +d.NewCount;
                 d['7DayAvg'] = +d['7DayAvg'];
                 return d;
             }),
            d3.json(caseEventsDataFile),
            d3.json(DATA_IDS),
            d3.json(DATA_STATE_COLORS)])
    .then(function (datasets) {

        init();

        loadDataSets(datasets);

        generateScales();

        generatePathGenerators();

        renderAxes();

        buildEventTimeline();

        setupChartControlListeners();

        addNavigationControls();

        var stateCasesByDate  = d3.nest()
            .key(function (d) {
                return d.Date;  
            })
            .entries(dataDatewiseStateCases);

        stateCasesByDate.forEach(function (d) {
            d.key = new Date(d.key);
        });
        
        stateCasesByDate.forEach(function (d, i) {
            var casesByState = {};
            d.values.forEach(function (d2) {
                casesByState[d2.State] = d2['7DayAvg'];
            });
            casesByState['Date'] = d.key;
            dataStateConfirmedCasesDateNested[d.key] = casesByState;
        });

        allStateAndCountryData = Object.values(dataStateConfirmedCasesDateNested);

        // Initial pause before starting the animation, to let user read through the layout
        d3.timeout(function() {
            redrawStory();
        }, EVENT_PAUSE_INTERVAL);
    }
);

function redrawStory() {
    clearDrawings();

    if (dataAggregationLevel == 'AllStates') {
        currChartKeys = Object.keys(stateCodesMap);
        currChartKeys = currChartKeys.filter(d => !d.startsWith("_"));
    }
    else if(dataAggregationLevel == 'TopFive') {
        currChartKeys = TOP_FIVE_STATE_CODES;
    }

    currDate = dataTimeLineRange[0];
    allStatesStackedData = d3.stack().keys(currChartKeys)(allStateAndCountryData); 
    drawCountryLineChart(d3.stack().keys(['_USA'])(allStateAndCountryData)[0]);

    if (timer != null) {
        timer.stop();
    }
    timer = d3.interval(callback(), ANIMATION_INTERVAL);
    renderChart(currDate);
}

function clearDrawings() {
    d3.select("#main-chart-grp-curves").selectAll("*").remove();
    d3.select("#timeline-chart-caption-grp").selectAll("*").remove();
    d3.select("#timeline-chart-axis-grp").selectAll("*").remove();
    d3.select("#legend-grp").selectAll("*").remove();
    d3.select("#main-chart-annotations").selectAll("*").remove();

    d3.selectAll(".event-timeline-axis-cap-text").attr("fill-opacity", 0);
}

var callback = function() {
    return function () {
        currDate = new Date(currDate.getTime() + ONE_DAY);
        if (currDate <= dataDateRange[1]) {
            renderChart(currDate);
        }
        else {
            console.log('Timer stopped');
            timer.stop();
        }
        return true;
    }
}; 

function generateColors(size) {
    var colors = [];
    for(i=0; i < size; i++) {
        colors.push("hsl(" + Math.random() * 360 + ", 100%, 50%)");
    }
    return colors;
}

function init() {
    if (mode == 'newCases') {
        d3.select(".chart-title")
            .text("USA COVID'19 Journey - 7Day Rolling Avg of Newly Confirmed Cases");
    }
    else if (mode == 'deaths') {
        d3.select(".chart-title")
            .text("USA COVID'19 Journey - 7Day Rolling Avg of Newly Deaths Cases");
    }
}

function loadDataSets(datasets) {
    dataStateCodes = datasets[0];
    dataDatewiseStateCases = datasets[1];
    dataStateEvents = datasets[2];
    IDs = datasets[3];
    colors = datasets[4];    

    stateCodesMap = {};
    dataStateCodes.forEach(function (d) {
        stateCodesMap[d.StateCode.trim()] = d;
    });        
    
    stateCodesMap['_OthersTop5'] = {"State" : "States except AZ, CA, FL, NY and TX", "StateCode" : "_OthersTop5", "FIPS" : "-1"};

    dataDateRange = d3.extent(dataDatewiseStateCases, function (d) {
        return d.Date;
    });
    
    casesRange = d3.extent(dataDatewiseStateCases, function (d) {
        return d['7DayAvg'];
    });

    // Round to nearest 1000s
    casesRange[1] = roundNice(casesRange[1]);
}

function roundNice(num) {
    // Round to nearest 1000s
    if (num > 1000 && num < 10000) {
        num = Math.ceil(num/1000) * 1000;
    }
    else if (num > 10000) {
        num = Math.ceil(num/10000) * 10000;
    }   

    return num;
}

function moveTimelineToDate(currDate, dateFilteredStackedData) {
    d3.select("#" + IDs.EventTimelineInnerRect)
        .transition()
        .ease(d3.easeLinear)
        .duration(ANIMATION_INTERVAL)
        .attr("height", Scales.TimeLineScale(currDate));

    var eventPayload = dataStateEvents[timeFormatter(currDate)];
    if (eventPayload) {
        
        d3.select("#" + IDs.EventTimelineInnerCir + timeFormatterHyphen(currDate))
            .transition()
            .ease(d3.easeLinear)
            .duration(ANIMATION_INTERVAL)
            .attr("fill-opacity", 1);

        d3.select("#" + IDs.EventTimelineText + timeFormatterHyphen(currDate))
            .transition()
            .ease(d3.easeLinear)
            .duration(ANIMATION_INTERVAL)
            .attr("fill-opacity", 1);

        if (eventPayload.Annotation) {
            var stateCodeIdx = -1;
            if (!eventPayload.Annotation.StateCode.startsWith("_")) {
                stateCodeIdx = currChartKeys.indexOf(eventPayload.Annotation.StateCode);

            }
            else if (eventPayload.Annotation.StateCode.startsWith("_USA")) {
                // For country outline, pick the last state area layer
                stateCodeIdx = currChartKeys.length - 1;
            }
            var stateTimeSeriesData = dateFilteredStackedData[stateCodeIdx];
            var stateAreaPathData = stateTimeSeriesData[stateTimeSeriesData.length-1];
            
            drawAnnotation(currDate,
                            stateAreaPathData[1],
                            eventPayload.Annotation);     
        }   

        var pauseOnEvents = d3.select("#pauseonevt-control-soc").node().value;
        
        if (pauseOnEvents == 'Y') {
            timer.stop();
            d3.timeout(function() {
                timer.restart(callback());
            }, EVENT_PAUSE_INTERVAL);
        }
        else {
            // Do not stop the timer;
        }
    }    
}

function renderChart(currDate) {

    renderLegend();

    var dateFilteredStackedData = allStatesStackedData.map(function (daysData, i) {
        var filteredDaysData = daysData.filter(function(dayData, j) {
            return dayData.data.Date.getTime() <= currDate.getTime();
        })
        return filteredDaysData;
    });

    var pathsSelection = d3.select(".main-chart-grp-curves").selectAll("path.statecurves");

    moveTimelineToDate(currDate, dateFilteredStackedData);

    // Update selection
    pathsSelection.data(dateFilteredStackedData)
        .transition()
        .duration(ANIMATION_INTERVAL)
        .attr("d", function (d, i) {
            return Generators.StateAreaGenerator(d);
        });

    // Enter selection
    pathsSelection
        .data(dateFilteredStackedData)
        .enter()
        .append("path")
        .attr("class", "statecurves")
        .attr("data-state", (d, i) => {
            return getAreaChartCode([i]);
        })
        .style("stroke", 'none')
        .style("fill", function (d, i) {
            return getAreaChartColor(i);
        })
        .attr("d", function (d, i) {
            return Generators.StateAreaGenerator(d);
        })
        .on("mousemove", function (d, i) {
            var stateCode = getAreaChartCode(i);
            var stateStats = getStateStats(stateCode);

            if (mode == 'newCases') {
                d3.select("#tooltip-header")
                .html('Positive Cases Summary:');                
            }
            else {
                d3.select("#tooltip-header")
                .html('Death Cases Summary:');                  
            }

            d3.select("#tooltip-state")
                .html(getStateCodeInfo([i]).State);

            d3.select("#tooltip-peak-1d-count")
                .html(stateStats.Peek1DCount);

            d3.select("#tooltip-peak-1d-on")
                .html(dateMonthTimeFormatter(stateStats.Peek1DOn));

            d3.select("#tooltip-total")
                .html(stateStats.Total);

            d3.select("div.tooltip")
                // .html(getStateCodeInfo([i]).State)
                .style("left", (d3.event.pageX) + "px")		
                .style("top", (d3.event.pageY - 100) + "px");              
                
            d3.select(this).style("fill-opacity", "1");
            d3.select(this).attr("stroke", "white");

            d3.select("div.tooltip").transition()		
            .duration(200)		
            .style("opacity", .75);              

            var hoveredState = d3.select(this).attr("data-state")

            d3.selectAll("path.statecurves")
            .filter(function(d) {
                return hoveredState != d3.select(this).attr("data-state");
            })
            .attr("opacity", 0.2);
        })
        .on("mouseout", function (d, i) {
            d3.select("div.tooltip").transition()		
                .duration(200)		
                .style("opacity", 0);

            d3.selectAll("path.statecurves")
                .attr("opacity", 1);

            d3.select(this).attr("stroke", "none");
        });
}

function drawCountryLineChart(countryData) {
    d3.select(".main-chart-grp-curves").append("path")
        .attr("stroke", "white")
        .attr("opacity", "0.25")
        .attr("fill", "none")
        .attr("d", Generators.CountryLineGenerator(countryData));
}

function getAreaChartCode(idx) {
    return currChartKeys[idx];
}

function getAreaChartColor(idx) {
    var code = currChartKeys[idx];
    return colors[code];
}    

function getStateCodeInfo(idx) {
    return stateCodesMap[currChartKeys[idx]];
}

function getStateStats(stateCode) {
    var stats = {}
    stats.Peek1DCount = -1;
    stats.PeekAvg = -1;
    stats.Total = -1;
    dataDatewiseStateCases.forEach(function (d) {
        if (d.State == stateCode) {

            if (d.NewCount > stats.Peek1DCount) {
                stats.Peek1DCount = d.NewCount;
                stats.Peek1DOn = d.Date;
            }

            if (d['7DayAvg'] > stats.PeekAvg) {
                stats.PeekAvg = d['7DayAvg'];
                stats.PeekAvgOn = d.Date;
            }

            if (d['Count'] > stats.Total) {
                stats.Total = d['Count'];
            }
        }
    });

    
    return stats;
}

function computeDims() {
    var clearance = 20;
    var totalHeight = window.innerHeight;
    var totalWidth = window.innerWidth;

    Dims.LegendChart.Width = totalWidth - Dims.EventsChart.Width; 

    Dims.MainSvg.Width = totalWidth - Dims.EventsChart.Width;
    Dims.MainSvg.Height = totalHeight;

    Dims.MainSvgChart.Width = Dims.MainSvg.Width - Dims.Margin.Left - Dims.Margin.Right;
    Dims.MainSvgChart.Height = Dims.MainSvg.Height - Dims.Margin.Top - Dims.Margin.Bottom - Dims.LegendChart.Height;


    Dims.EventsChart.Width = Dims.EventsChart.Width - clearance;
    // Dims.EventsChart.Height =  Dims.EventsChart.Height + 400;
}

function generateScales() {
    Scales.MainXScale = d3.scaleTime()
        .domain(dataDateRange)
        .range([0, Dims.MainSvgChart.Width]);

    Scales.MainYScale = d3.scaleLinear()
        .domain(casesRange)
        .range([Dims.MainSvgChart.Height, 0]);   
        
    Scales.TimeLineScale = d3.scaleTime()
        .domain(totalTimeLineRange)
        .range([0, Dims.EventsChart.Height - 200]);            
}

function generatePathGenerators() {
    Generators.CountryLineGenerator = d3.line()
        .x(function (d, i) {
            return Scales.MainXScale(d.data.Date);
        })
        .y(function (d, i) {
            return Scales.MainYScale(d[1]);
        });

    Generators.StateAreaGenerator = d3.area()
        .x(function (d, i) {
            return Scales.MainXScale(d.data.Date);
        })
        .y0(function (d) {
            return Scales.MainYScale(d[0]);
        })
        .y1(function (d) {
            return Scales.MainYScale(d[1]);
        })
        .curve(d3.curveCatmullRom);        
}

function setupChartControlListeners() {
    d3.select("#aggrType-control-soc")
        .on("change", function() {
            var selection = d3.select(this).node().value;
            dataAggregationLevel = selection;
            redrawStory();
        });
}

function setLayoutSizings() {
    d3.select("svg#svg-main")
        .attr("width", Dims.MainSvg.Width)
        .attr("height", Dims.MainSvg.Height); 

    d3.select("#main-chart-grp")
        .attr("transform", `translate(${Dims.Margin.Left},${Dims.Margin.Top})`);
    
    d3.select("#legend-grp")
        .attr("transform", `translate(${Dims.Margin.Left},${Dims.MainSvg.Height - Dims.LegendChart.Height})`);

    d3.select("#navigation-grp")
        .attr("transform", `translate(${Dims.EventsChart.Width - Dims.NavigationBox.Width - Dims.Margin.Right}, ${0})`);
        
    d3.select("svg#svg-timeline")
        .attr("width", Dims.EventsChart.Width)
        .attr("height", Dims.EventsChart.Height);
        
    d3.select("#timeline-chart-grp")
        .attr("transform", `translate(${Dims.Margin.Left}, ${Dims.Margin.Top})`);

    d3.select("#timeline-chart-grp").append("g")
        .attr("class", "timeline-chart-axis-grp")
        .attr("transform", "translate(10,0)");

    d3.select("#timeline-chart-grp").append("g")
        .attr("class", "timeline-chart-caption-grp")
        .attr("transform", "translate(30,0)");         
}

function renderAxes() {
    d3.select("#main-chart-xaxis")
        .attr("transform", `translate(0, ${Dims.MainSvgChart.Height})`)
        .attr("stroke", "white")
        .attr("fill", "none")
        .call(d3.axisBottom(Scales.MainXScale)
                .tickValues(Scales.MainXScale.ticks(d3.timeMonth.every(1))
                            .concat(Scales.MainXScale.domain()))
                .tickFormat(d => {
                    return dateMonthTimeFormatter(d);
                })
            )
        .call(g => g.select(".domain").remove());

    d3.select("#main-chart-yaxis")
        .call(d3.axisRight(Scales.MainYScale)
                .tickValues(Scales.MainYScale.ticks())
                .tickSize(Dims.MainSvgChart.Width)) // Tick covering whole chart
        .call(g => g.select(".domain").remove())
        .call(g => g.selectAll(".tick text").attr("x", 4).attr("dy", -4));
        
    d3.select(".timeline-chart-axis-grp")
        .attr("stroke", "white")
        .attr("fill", "none")    
        .call(d3.axisLeft(Scales.TimeLineScale)
                .tickValues(Scales.TimeLineScale.ticks(d3.timeMonth.every(1)).concat(Scales.TimeLineScale.domain()))
                .tickSize(10)
                .tickFormat(d => {
                    return dateMonthTimeFormatter(d);
                })                
        )
        .call(g => g.select(".domain").remove());
}

function renderLegend() {
    // Each legend size = 60
    var numPerRow = Math.round(Dims.LegendChart.Width / 60);
    var numOfLegends = currChartKeys.length;
    var legendGrpItem = d3.select("#legend-grp").selectAll("g")
        .data(currChartKeys)
        .enter()
        .append("g")
        .attr("transform", function (d, i) {
            var rowIdx = i % numPerRow;
            var colIdx = Math.floor(i / numPerRow);
            return `translate(${rowIdx * 60}, ${colIdx * 60})`
        });

    legendGrpItem.append("rect")
        .attr("x", 0)
        .attr("y", 0)
        .attr("width", 20)
        .attr("height", 20)
        .attr("fill", function (d, i) {
            return getAreaChartColor(i);
        });
        
    legendGrpItem.append("text")
        .attr("x", "2")
        .attr("y", "-3")
        .attr("class", "legend-txt")
        .attr("fill", "white")
        .attr("text-anchor", "start")
        .attr("alignment-baseline", "central")
        .text(function (d, i) {
            return getStateCodeInfo(i).StateCode;
        });

    legendGrpItem
        .on("mouseover", function (d, i) {
            var hoveredState = getAreaChartCode(i);
            d3.selectAll("path.statecurves")
                .filter(function(d) {
                    return hoveredState != d3.select(this).attr("data-state");
                })
                .attr("opacity", 0.2);

        })
        .on("mouseout", function (d, i) {
            d3.selectAll("path.statecurves")
                .attr("opacity", 1);
        })            
}

function addNavigationControls() {
    d3.select(".navig-refresh-ctrl-grp")
        .on("mousemove", function() {
            d3.select(".navig-refresh-ctrl").attr("stroke", "yellow");
        })
        .on("mouseout", function() {
            d3.select(".navig-refresh-ctrl").attr("stroke", "red");
        })
        .on("click", function() {
            redrawStory();
        });

    d3.select(".navig-prev-ctrl-grp")
        .on("mousemove", function() {
            d3.select(".navig-prev-ctrl").attr("stroke", "yellow");
        })
        .on("mouseout", function() {
            d3.select(".navig-prev-ctrl").attr("stroke", "red");
        })
        .on("click", function() {
            if (mode == 'deaths') {
                window.location.href = "USStateCovidRollingAverage.html?mode=newCases";
            }
            else {
                window.location.href = "USStateCovidCasesGeoMap.html?mode=deaths";
            }
        });

    d3.select(".navig-home-ctrl-grp")
        .on("mousemove", function() {
            d3.select(".navig-home-ctrl").attr("stroke", "yellow");
        })
        .on("mouseout", function() {
            d3.select(".navig-home-ctrl").attr("stroke", "red");
        })
        .on("click", function() {
            window.location.href = "index.html";
        });    

    d3.select(".navig-next-ctrl-grp")
        .on("mousemove", function() {
            d3.select(".navig-next-ctrl").attr("stroke", "yellow");
        })
        .on("mouseout", function() {
            d3.select(".navig-next-ctrl").attr("stroke", "red");
        })
        .on("click", function() {
            if (mode == 'newCases') {
                window.location.href = "USStateCovidRollingAverage.html?mode=deaths";
            }
            else {
                window.location.href = "end.html";
            }
        });                   
}

function buildEventTimeline() {
    const timelineAxisWidth = 3;              

    var highlightsAxisGrp = d3.select(".timeline-chart-axis-grp");
    var highlightsCaptionGrp = d3.select(".timeline-chart-caption-grp");
    highlightsAxisGrp.append("rect")
        .attr("id", IDs.EventTimelineOuterRect)
        .attr("class", IDs.EventTimelineOuterRect)
        .attr("x", 0)
        .attr("y", 0)
        .attr("width", timelineAxisWidth)
        .attr("height", Dims.EventsChart.Height - 200)
        .attr("fill-opacity", "0.25");

    highlightsAxisGrp.append("rect")
        .attr("id", IDs.EventTimelineInnerRect)
        .attr("class", IDs.EventTimelineInnerRect)
        .attr("x", 0)
        .attr("y", 0)
        .attr("width", timelineAxisWidth)
        .attr("height", 0)
        .attr("fill-opacity", "1");

    highlightsAxisGrp.selectAll("circle." + IDs.EventTimelineOuterCir)
        .data(Object.keys(dataStateEvents))
        .enter()
        .append("circle")
        .attr("class", IDs.EventTimelineOuterCir)
        .attr("cx", function (d, i) {
            return timelineAxisWidth/2;
        })
        .attr("cy", function (d, i) {
            return Scales.TimeLineScale(timeParser(d));
        })
        .attr("r", 5);

    highlightsAxisGrp.selectAll("circle." + IDs.EventTimelineInnerCir)
        .data(Object.keys(dataStateEvents))
        .enter()
        .append("circle")
        .attr("id", function (d, i) {
            return IDs.EventTimelineInnerCir + timeFormatterHyphen(timeParser(d));
        })
        .attr("class", IDs.EventTimelineInnerCir)
        .attr("cx", function (d, i) {
            return timelineAxisWidth/2;
        })
        .attr("cy", function (d, i) {
            return Scales.TimeLineScale(timeParser(d));
        })
        .attr("r", 4)
        .attr("fill-opacity", 0);
    
    highlightsCaptionGrp.selectAll("text")
        .data(Object.keys(dataStateEvents))
        .enter()
        .append("text")
        .attr("id", function (d, i) {
            return IDs.EventTimelineText + timeFormatterHyphen(timeParser(d));
        })
        .attr("class", "event-timeline-axis event-timeline-axis-cap-text")
        .attr("fill", "black")
        .attr("fill-opacity", "0")
        .attr("dominant-baseline", "middle")
        .attr("x", function (d, i) {
            return 0;
        })
        .attr("y", function (d, i) {
            return Scales.TimeLineScale(timeParser(d));
        })
        .text(function (d, i) {
            return "[" + d + "] " + dataStateEvents[d].Desc;
        });
}

function getMode() {
    var queryParams = location.search.replace('\?','').split('&');
    var modeType = queryParams.find(function (d) {
        if (d.startsWith("mode=")) {
            return true;
        }
        return false;
    });
    
    if (modeType == undefined || modeType == null) {
        modeType = 'newCases';
    }
    else {
        modeType = modeType.substring("mode=".length);
        if (modeType != 'newCases' && modeType != 'deaths') {
            modeType = "newCases";
        }
    }
    return modeType;
}

function drawAnnotation(x, y, annotConfig) {
    annotConfig.TipShortLength = (annotConfig.TipShortLength != undefined) ? annotConfig.TipShortLength : 75;
    annotConfig.TipLongLength = (annotConfig.TipLongLength != undefined) ? annotConfig.TipLongLength : 200;
    annotConfig.SlopeInDegrees = (annotConfig.SlopeInDegrees != undefined) ? annotConfig.SlopeInDegrees : 45;
    annotConfig.Text = (annotConfig.Text != undefined) ? annotConfig.Text : "<Text missing>";

    var origin = [Scales.MainXScale(x), Scales.MainYScale(parseInt(y))];

    var slopeRadians = (Math.PI / 180) * annotConfig.SlopeInDegrees;

    var x1 = [ -1 * Math.sin(slopeRadians) * annotConfig.TipShortLength,
               -1 * Math.cos(slopeRadians) * annotConfig.TipShortLength];

    var x2 = [x1[0] - annotConfig.TipLongLength,
              x1[1]];

    var annotGrp = d3.select("#main-chart-annotations")
        .append("g")
        .attr("transform", `translate(${origin[0]}, ${origin[1]})`);

    annotGrp.append("path")
        .attr("fill", "none")
        .attr("stroke", "white")
        .attr("opacity", "0.75")
        .attr("d", function () {
            // return `M0,0L0,-${tipShortLength}L-${tipLongLength},-${tipShortLength}`;
            return `M0,0    L${x1[0]}${x1[1]}  L${x2[0]}${x2[1]}`;
        });

    annotGrp.append("text")
        .attr("class", "annot-text")
        // .attr("fill", "white")
        .attr("x", x2[0])
        .attr("y", x2[1] - 4)
        .text(annotConfig.Text);

    annotGrp.append("g")
        .attr("class", "annot-head-triangle")
        .attr("transform", `rotate(${180 - annotConfig.SlopeInDegrees} 0 0)`)
        .append("path")
            .attr("fill", "#5680E9")
            // .attr("d", "M0,0  L10,0 L0,-10 L-10,0 Z")
            .attr("d", "M0,0  L10,10 L0,10 L-10,10 Z");        
    
}