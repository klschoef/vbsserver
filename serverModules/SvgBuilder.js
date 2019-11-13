
const svgBuilder = require('svg-builder');

const  strokeDashArrayValues = "2,2";

/**
 * Class for generating visualization SVGs for KIS and ABS task submissions.
 */
class SvgBuilder 
{
  /**
     * Vizualization chart for KIS submissions.
     * 
     * @param {*} svgSettings 
     * @param {*} filteredTasks 
     * @param {*} teams 
     */
    static generateKisSubmissionsChart(svgSettings, filteredTasks, teams) 
    {
        //
        // SVG configuration.
        //

        // Instantiate new SVG.
        let svg = svgBuilder.newInstance();

        // SVG diagram:
        // _____________________________________
        // |           Top padding              |
        // |   -----------------------------    |
        // |   |         Header            |    |
        // |   -----------------------------    |
        // | Left padding                  |    |
        // |   |         Content           |  Right padding
        // |   |                           |    |
        // |   -----------------------------    |
        // |   |         Footer            |    |
        // |   -----------------------------    |
        // |        Bottom padding              |
        // |____________________________________|

        // Height of the header & footer.
        const footerHeight = 50;
        const headerHeight = 50;

        const teamNameWidth = 120;

        // We have to print team legend in the footer.
        //  Lets have 150px for each team.
        let minWidth = teamNameWidth * teams.length;


        // Width of column for each submission timepline.
        const teamColumnWidth = svgSettings.columnWitdth;

        // Get total width of result SVG.
        const svgWidth = Math.max(minWidth, filteredTasks.length * teamColumnWidth + svgSettings.leftPadding + svgSettings.rightPadding);
        
        // Compute inner width & height.
        const contentHeight = svgSettings.svgHeight - (svgSettings.topPadding + svgSettings.bottomPadding) - + footerHeight;
        const contentWidth = svgWidth - svgSettings.leftPadding - svgSettings.rightPadding;

        // Compute base offsets .
        const xOffsetHeader = svgSettings.leftPadding;
        const yOffsetHeader = svgSettings.topPadding;

        const xOffsetContent = svgSettings.leftPadding;
        const yOffsetContent = svgSettings.topPadding + headerHeight;

        const xOffsetFooter = svgSettings.leftPadding;
        const yOffsetFooter = svgSettings.topPadding + contentHeight;


        // Timeline line color.
        const taskTimelineStrokeColor = "black";
        // Timeline line width.
        const taskTimelineStrokeWidth = 0.5;
        // Height in pixels of one second of search time.
        const heightOneSecond = contentHeight / svgSettings.maxTaskSearchTime;

        // Ratio between the biggest s
        const minMaxRatio = svgSettings.minTaskSearchTime / svgSettings.maxTaskSearchTime;
        
        let timelineMarkStrokeWidth = 0.4;
        let timelineMarkSize = 10;

        // Set SVG dimensions
        svg.width(svgWidth).height(svgSettings.svgHeight);

        //
        // Draw SVG header
        //
        const gridYInterval = 10;

        // Draw grid
        for (let ii = 0; ii <= svgSettings.maxTaskSearchTime; ii += gridYInterval)
        {
            svg.text({
                x: svgSettings.leftPadding - 60,
                y: (svgSettings.topPadding + contentHeight) - (heightOneSecond * ii) + 7,
                'font-family': 'arial',
                'font-size': 12,
                fill: '#aaa'
            }, String(ii));
    
            svg.line({
                x1: svgSettings.leftPadding - 30,
                y1: (svgSettings.topPadding + contentHeight) - (heightOneSecond * ii),
                x2: svgSettings.leftPadding + contentWidth - 30,
                y2: (svgSettings.topPadding + contentHeight) - (heightOneSecond * ii),
                stroke: '#aaa',
                'stroke-width': 1
            });
        }

        //
        // Draw submit timelines
        //

        // Iterate over all provided tasks to vizualize
        for (let i = 0; i < filteredTasks.length; ++i)
        {
            // Get current task
            const task = filteredTasks[i];

            // Base for X offset
            let currX = xOffsetContent + (teamColumnWidth / 2);

            // Left offset for this task
            currX += (teamColumnWidth * i) - (teamColumnWidth / 2);

            // Task timeline
            svg.line({
                x1: currX,
                y1: (svgSettings.topPadding + contentHeight) - (heightOneSecond * task.maxSearchTime),
                x2: currX,
                y2: svgSettings.topPadding + contentHeight,
                stroke: taskTimelineStrokeColor,
                'stroke-width': taskTimelineStrokeWidth
            });

            // // Number
            // svg.text({
            //     x: currX,
            //     y: svgSettings.topPadding,
            //     'font-family': 'arial',
            //     'font-size': 20,
            //     stroke : '#000',
            //     fill: '#000',
            // }, String(i + 1));

            // Name
            svg.text({
                x: 0,
                y: 0,
                'font-family': 'arial',
                'font-size': 10,
                fill: '#aaa',
                transform: 'translate(' + String(currX + 15) + ', ' + String(svgSettings.topPadding - 10) + ') rotate(-90)'
            }, task.name);

            // Type
            svg.text({
                x: 0,
                y: 0,
                'font-family': 'arial',
                'font-size': 8,
                fill: '#000',
                transform: 'translate(' + String(currX) + ', ' + String(svgSettings.topPadding - 10) + ') rotate(-90)'
            }, task.type);

            // Draw submits
            for (let jj = 0; jj < task.submissions.length; ++jj)
            {
                const sub = task.submissions[jj];
                let dashed = true;

                // Empahsize correct submissions
                if (sub.correct == true)
                {
                    dashed = false;
                    timelineMarkStrokeWidth = 1;
                }

                const currY = svgSettings.topPadding + (contentHeight - (heightOneSecond * sub.searchTime));
                
                // Draw specific team mark
                this.drawTeamMark(sub.teamNumber, svg, currX, currY, timelineMarkSize, sub.teamColor, timelineMarkStrokeWidth, dashed);
                
            }
        }

        //
        // Draw SVG footer
        //
        let currX = 40;
        let currY = yOffsetFooter + 40;
        for (let ii = 0; ii < teams.length; ++ii)
        {
            const team = teams[ii];

            // Draw specific team mark
            this.drawTeamMark(team.teamNumber, svg, currX, currY - 15, 2 * timelineMarkSize, team.color, 3, false);
            
            // Draw team name
            svg.text({
                x:  currX + 1.5 * timelineMarkSize,
                y: currY - 10,
                'font-family': 'arial',
                'font-size': 16,
                fill: team.color
            }, String(team.name));

            currX += teamNameWidth;
        }

        // Render final SVG
        return svg.render();
    }

    /**
     * Vizualization chart for AVS submissions.
     * 
     * @param {*} svgSettings 
     * @param {*} filteredTasks 
     * @param {*} teams 
     */
    static generateAvsSubmissionsChart(svgSettings, filteredTasks, teams) 
    {
        //
        // SVG configuration.
        //

        // Instantiate new SVG.
        let svg = svgBuilder.newInstance();

        // SVG diagram:
        // _____________________________________
        // |           Top padding              |
        // |   -----------------------------    |
        // |   |         Header            |    |
        // |   -----------------------------    |
        // | Left padding                  |    |
        // |   |         Content           |  Right padding
        // |   |                           |    |
        // |   -----------------------------    |
        // |   |         Footer            |    |
        // |   -----------------------------    |
        // |        Bottom padding              |
        // |____________________________________|

        // Height of the header & footer.
        const footerHeight = 50;
        const headerHeight = 50;

        const teamNameWidth = 5;

        // We have to print team legend in the footer.
        //  Lets have 150px for each team.
        let minWidth = 0;
        for (var i = 0; i < teams.length; ++i)
        {
            minWidth += teams[i].name.length * teamNameWidth;
        }

        // Width of column for each submission timepline.
        const teamColumnWidth = svgSettings.columnWitdth;

        // Get total width of result SVG.
        const svgWidth = Math.max(minWidth, filteredTasks.length * teams.length * teamColumnWidth + svgSettings.leftPadding + svgSettings.rightPadding);
        
        // Compute inner width & height.
        const contentHeight = svgSettings.svgHeight - (svgSettings.topPadding + svgSettings.bottomPadding) - footerHeight;
        const contentWidth = svgWidth - svgSettings.leftPadding - svgSettings.rightPadding;

        // Compute base offsets .
        const xOffsetHeader = svgSettings.leftPadding;
        const yOffsetHeader = svgSettings.leftPadding;

        const xOffsetContent = svgSettings.leftPadding;
        const yOffsetContent = svgSettings.leftPadding + headerHeight;

        const xOffsetFooter = svgSettings.leftPadding ;
        const yOffsetFooter = svgSettings.leftPadding + contentHeight + headerHeight;

        const teamDist = 40;

        // Timeline line color.
        const taskTimelineStrokeColor = "black";
        // Timeline line width.
        const taskTimelineStrokeWidth = 0.5;
        // Height in pixels of one second of search time.
        const heightOneSecond = contentHeight / svgSettings.maxTaskSearchTime;

        // Set SVG dimensions
        svg.width(svgWidth).height(svgSettings.svgHeight);

        //
        // Draw SVG header
        //
        const gridYInterval = 10;

        // Draw grid
        for (let ii = 0; ii <= svgSettings.maxTaskSearchTime; ii += gridYInterval)
        {
            svg.text({
                x: svgSettings.leftPadding - 30,
                y: (svgSettings.topPadding + contentHeight) - (heightOneSecond * ii) + 7,
                'font-family': 'arial',
                'font-size': 12,
                fill: '#000'
            }, String(ii));
    
            svg.line({
                x1: svgSettings.leftPadding,
                y1: (svgSettings.topPadding + contentHeight) - (heightOneSecond * ii),
                x2: svgSettings.leftPadding + contentWidth  + 90,
                y2: (svgSettings.topPadding + contentHeight) - (heightOneSecond * ii),
                stroke: '#000',
                'stroke-width': 0.4
            });
        }

        //
        // Draw submit timelines
        //
        let currX = xOffsetContent + 40;
        // Iterate over all provided tasks to vizualize
        for (let i = 0; i < filteredTasks.length; ++i)
        {
            // Get current task
            const task = filteredTasks[i];

            // Left offset for this task
            currX += (teamColumnWidth * i) - (teamColumnWidth / 2);

            // Number
            // svg.text({
            //     x: currX,
            //     y: svgSettings.topPadding - 70,
            //     'font-family': 'arial',
            //     'font-size': 20,
            //     stroke : '#000',
            //     fill: '#000',
            // }, String(i + 1));

           // Name
            svg.text({
                x: currX,
                y: svgSettings.topPadding - 50,
                'font-family': 'arial',
                'font-size': 12,
                fill: '#aaa',
            }, task.name);

            // Type
            svg.text({
                x: currX,
                y: svgSettings.topPadding - 30,
                'font-family': 'arial',
                'font-size': 8,
                fill: '#000',
            }, task.type); 

            for (let kk = 0; kk < teams.length; ++kk)
            {
                const team = teams[kk];

                // Draw submits
                for (let jj = 0; jj < task.submissions.length; ++jj)
                {
                    const sub = task.submissions[jj];
                    let dashed = true;

                    if (team.teamNumber != sub.teamNumber)
                    {
                        continue;
                    }

                    let color = "red";
                    if (sub.correct == true)
                    {
                        color = "green";
                    }

                    const currY = svgSettings.topPadding + (contentHeight - (heightOneSecond * sub.searchTime));
                    
                    // Draw specific team mark
                    this.drawLineMark(svg, currX, currY, 14, color, 1, false);
                    
                }

                svg.line({
                    x1: currX,
                    y1: (svgSettings.topPadding + contentHeight) - (heightOneSecond * task.maxSearchTime),
                    x2: currX,
                    y2: svgSettings.topPadding + contentHeight,
                    stroke: taskTimelineStrokeColor,
                    'stroke-width': taskTimelineStrokeWidth
                });

                // Draw team name
                svg.text({
                    x: 0,
                    y: 0,
                    'font-family': 'arial',
                    'font-size': 14,
                    fill: team.color,
                    transform: 'translate(' + String(currX - 7) + ', ' + String(svgSettings.topPadding + contentHeight + 10) + ') rotate(90)'
                }, String(team.name));

                currX += teamDist;
            }
            svg.line({
                x1: currX,
                y1: (svgSettings.topPadding + contentHeight) - (heightOneSecond * task.maxSearchTime) - 40,
                x2: currX,
                y2: svgSettings.topPadding + contentHeight  + 40,
                stroke: "red",
                'stroke-width': taskTimelineStrokeWidth
            });
            currX += 50;
        }

        // Render final SVG
        return svg.render();
    }

    /**
     * Draws into provided SVG cross with center in ('centerX', 'centerY')
     * that has provided 'width' and 'height', color of stroke is 'color' 
     * and stroke width is 'strokeWidth'
     *
     * @param {*} refSvg 
     * @param {*} x 
     * @param {*} y 
     * @param {*} w 
     * @param {*} heigh 
     * @param {*} color 
     * @param {*} strokeWidth 
     */
    static drawCrossMark(refSvg, x, y, w, color, strokeWidth, dashed)
    {
        const strokeDashArray = (dashed) ? strokeDashArrayValues: "none";

        refSvg.line({
            x1: x - (w / 2) ,
            y1: y - (w / 2),
            x2: x + (w / 2),
            y2: y + (w / 2),
            stroke: color,
            "stroke-dasharray": strokeDashArray,
            'stroke-width': strokeWidth
        });

        refSvg.line({
            x1: x - (w / 2),
            y1: y + (w / 2),
            x2: x + (w / 2),
            y2: y - (w / 2),
            "stroke-dasharray": strokeDashArray,
            stroke: color,
            'stroke-width': strokeWidth
        });
    }

    static drawPlusMark(refSvg, x, y, w, color, strokeWidth, dashed)
    {
        const strokeDashArray = (dashed) ? strokeDashArrayValues: "none";

        refSvg.line({
            x1: x - (w / 2) ,
            y1: y,
            x2: x + (w / 2),
            y2: y,
            stroke: color,
            "stroke-dasharray": strokeDashArray,
            'stroke-width': strokeWidth
        });

        refSvg.line({
            x1: x,
            y1: y + (w / 2),
            x2: x,
            y2: y - (w / 2),
            "stroke-dasharray": strokeDashArray,
            stroke: color,
            'stroke-width': strokeWidth
        });
    }

    static drawLineMark(refSvg, x, y, w, color, strokeWidth, dashed)
    {
        const strokeDashArray = (dashed) ? strokeDashArrayValues: "none";

        refSvg.line({
            x1: x - (w / 2) ,
            y1: y,
            x2: x + (w / 2),
            y2: y,
            stroke: color,
            "stroke-dasharray": strokeDashArray,
            'stroke-width': strokeWidth
        });
    }

    static drawTriangleMark(refSvg, x, y, w, color, strokeWidth, dashed)
    {
        const strokeDashArray = (dashed) ? strokeDashArrayValues: "none";
        const hw = w / 2;

        refSvg.line({
            x1: x - hw,
            y1: y - hw,
            x2: x,
            y2: y + hw,
            stroke: color,
            "stroke-dasharray": strokeDashArray,
            'stroke-width': strokeWidth
        });

        refSvg.line({
            x1: x,
            y1: y + hw,
            x2: x + hw,
            y2: y - hw,
            stroke: color,
            "stroke-dasharray": strokeDashArray,
            'stroke-width': strokeWidth
        });

        refSvg.line({
            x1: x + hw,
            y1: y - hw,
            x2: x - hw,
            y2: y - hw,
            stroke: color,
            "stroke-dasharray": strokeDashArray,
            'stroke-width': strokeWidth
        });
    }

    static drawHexagonMark(refSvg, x, y, w, color, strokeWidth, dashed)
    {
        const strokeDashArray = (dashed) ? strokeDashArrayValues: "none";
        const hw = w / 2;

        refSvg.line({
            x1: x - hw,
            y1: y,
            x2: x - hw/2,
            y2: y + hw,
            stroke: color,
            "stroke-dasharray": strokeDashArray,
            'stroke-width': strokeWidth
        })
        .line({
            x1: x - hw/2,
            y1: y + hw,
            x2: x + hw/2,
            y2: y + hw,
            stroke: color,
            "stroke-dasharray": strokeDashArray,
            'stroke-width': strokeWidth
        })
        .line({
            x1: x + hw/2,
            y1: y + hw,
            x2: x + hw,
            y2: y,
            stroke: color,
            "stroke-dasharray": strokeDashArray,
            'stroke-width': strokeWidth
        })
        .line({
            x1: x + hw,
            y1: y,
            x2: x + hw/2,
            y2: y - hw,
            stroke: color,
            "stroke-dasharray": strokeDashArray,
            'stroke-width': strokeWidth
        })
        .line({
            x1: x + hw/2,
            y1: y - hw,
            x2: x - hw/2,
            y2: y- hw,
            stroke: color,
            "stroke-dasharray": strokeDashArray,
            'stroke-width': strokeWidth
        })
        .line({
            x1: x - hw/2,
            y1: y- hw,
            x2: x - hw,
            y2: y,
            stroke: color,
            "stroke-dasharray": strokeDashArray,
            'stroke-width': strokeWidth
        });
    }

    static drawRectMark(refSvg, x, y, w, color, strokeWidth, dashed)
    {
        const strokeDashArray = (dashed) ? strokeDashArrayValues: "none";
        const hw = w / 2;

        refSvg.line({
            x1: x - hw,
            y1: y - hw / 2,
            x2: x - hw,
            y2: y + hw / 2,
            stroke: color,
            "stroke-dasharray": strokeDashArray,
            'stroke-width': strokeWidth
        })
        .line({
            x1: x - hw,
            y1: y + hw / 2,
            x2: x + hw,
            y2: y + hw / 2,
            stroke: color,
            "stroke-dasharray": strokeDashArray,
            'stroke-width': strokeWidth
        })
        .line({
            x1: x + hw,
            y1: y + hw / 2,
            x2: x + hw,
            y2: y - hw / 2,
            stroke: color,
            "stroke-dasharray": strokeDashArray,
            'stroke-width': strokeWidth
        })
        .line({
            x1: x + hw,
            y1: y - hw / 2,
            x2: x - hw,
            y2: y - hw / 2,
            stroke: color,
            "stroke-dasharray": strokeDashArray,
            'stroke-width': strokeWidth
        });
    }

    static drawSquareMark(refSvg, x, y, w, color, strokeWidth, dashed)
    {
        const strokeDashArray = (dashed) ? strokeDashArrayValues: "none";
        const hw = w / 2;

        refSvg.line({
            x1: x - hw,
            y1: y - hw,
            x2: x - hw,
            y2: y + hw,
            stroke: color,
            "stroke-dasharray": strokeDashArray,
            'stroke-width': strokeWidth
        })
        .line({
            x1: x - hw,
            y1: y + hw,
            x2: x + hw,
            y2: y + hw,
            stroke: color,
            "stroke-dasharray": strokeDashArray,
            'stroke-width': strokeWidth
        })
        .line({
            x1: x + hw,
            y1: y + hw,
            x2: x + hw,
            y2: y - hw,
            stroke: color,
            "stroke-dasharray": strokeDashArray,
            'stroke-width': strokeWidth
        })
        .line({
            x1: x + hw,
            y1: y - hw,
            x2: x - hw,
            y2: y - hw,
            stroke: color,
            "stroke-dasharray": strokeDashArray,
            'stroke-width': strokeWidth
        });
    }

    static drawCircleMark(refSvg, x, y, w, color, strokeWidth, dashed)
    {
        const strokeDashArray = (dashed) ? strokeDashArrayValues: "none";
        
        refSvg.circle({
            r: w / 2,
            fill: 'none',
            'stroke-width': strokeWidth,
            "stroke-dasharray": strokeDashArray,
            stroke: color,
            cx: x,
            cy: y
        });
    }

    static drawEllipseHorizontalMark(refSvg, x, y, w, color, strokeWidth, dashed)
    {
        const strokeDashArray = (dashed) ? strokeDashArrayValues: "none";
        const trans = "translate(" + x + ", " + y + ") scale(1, 0.5)";

        refSvg.circle({
            r: w / 2,
            fill: 'none',
            'stroke-width': strokeWidth,
            "stroke-dasharray": strokeDashArray,
            stroke: color,
            transform: trans,
            cx: 0,
            cy: 0
        });
    }

    static drawEllipseVerticalMark(refSvg, x, y, w, color, strokeWidth, dashed)
    {
        const strokeDashArray = (dashed) ? strokeDashArrayValues: "none";
        const trans = "translate(" + x + ", " + y + ") scale(0.5, 1)";

        refSvg.circle({
            r: w / 2,
            fill: 'none',
            'stroke-width': strokeWidth,
            "stroke-dasharray": strokeDashArray,
            stroke: color,
            transform: trans,
            cx: 0,
            cy: 0
        });
    }

    static drawTeamMark(teamId, svg, currX, centerY, markSize, teamColor, strokeWidth, dashed)
    {
        const numShapes = 10;
        const shapeIdx = teamId % numShapes;

        switch (shapeIdx)
        {
        case 0:
            this.drawCrossMark(svg, currX, centerY, markSize, teamColor, strokeWidth, dashed);
            break;

        case 1:
            this.drawCircleMark(svg, currX, centerY, markSize, teamColor, strokeWidth, dashed);
            break;

        case 2:
            this.drawEllipseHorizontalMark(svg, currX, centerY, markSize, teamColor, strokeWidth, dashed);
            break;

        case 3:
            this.drawTriangleMark(svg, currX, centerY, markSize, teamColor, strokeWidth, dashed);
            break;

        case 4:
            this.drawSquareMark(svg, currX, centerY, markSize, teamColor, strokeWidth, dashed);
            break;

        case 5:
            this.drawHexagonMark(svg, currX, centerY, markSize, teamColor, strokeWidth, dashed);
            break;
        
        case 6:
            this.drawPlusMark(svg, currX, centerY, markSize, teamColor, strokeWidth, dashed);
            break;

        case 7:
            this.drawLineMark(svg, currX, centerY, markSize, teamColor, strokeWidth, dashed);
            break;

        case 8:
            this.drawRectMark(svg, currX, centerY, markSize, teamColor, strokeWidth, dashed);
            break;

        case 9:
            this.drawEllipseVerticalMark(svg, currX, centerY, markSize, teamColor, strokeWidth, dashed);
        break;
        }
    }
}

module.exports = SvgBuilder;