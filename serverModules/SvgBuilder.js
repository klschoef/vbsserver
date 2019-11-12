
const svgBuilder = require('svg-builder');

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
        let svg = svgBuilder.newInstance();

        const taskTimelineWidth = 2;
        const yInterval = 30;
        const teamLineHeight = 20;

        const totalHeight = svgSettings.svgHeight + teams.length * teamLineHeight + 100;
        const innerHeight = svgSettings.svgHeight - (svgSettings.topPadding + svgSettings.bottomPadding);

        const oneTimeUnit = innerHeight / svgSettings.maxTaskSearchTime;

        const totalWidth = svgSettings.leftPadding + svgSettings.columnWitdth * filteredTasks.length + svgSettings.rightPadding;
        const innerWidth = totalWidth - svgSettings.leftPadding - svgSettings.rightPadding;
        // Set dimensions based on number of tasks
        svg.width(totalWidth)
            .height(totalHeight);

        const minMaxRatio = svgSettings.minTaskSearchTime / svgSettings.maxTaskSearchTime;

        const leftLabelNegOffset = svgSettings.leftLabelNegOffset;
        
        // Draw teams
        for (let ii = 0; ii < teams.length; ++ii)
        {
            const team = teams[ii];
            svg.text({
                x: svgSettings.leftPadding + 30,
                y: 40 +  svgSettings.topPadding + innerHeight + (ii * teamLineHeight) + 7,
                'font-family': 'arial',
                'font-size': 12,
                fill: team.color
            }, String(team.name));
    
            svg.line({
                x1: svgSettings.leftPadding,
                y1: 40 + svgSettings.topPadding + innerHeight + (ii * teamLineHeight),
                x2: svgSettings.leftPadding + 20,
                y2: 40 + svgSettings.topPadding + innerHeight + (ii * teamLineHeight),
                stroke: team.color,
                'stroke-width': 15
            });
        }

        // Draw grid
        for (let ii = 0; ii < svgSettings.maxTaskSearchTime; ii += yInterval)
        {
            svg.text({
                x: svgSettings.leftPadding - leftLabelNegOffset - 30,
                y: (svgSettings.topPadding + innerHeight) - (oneTimeUnit * ii) + 7,
                'font-family': 'arial',
                'font-size': 12,
                fill: '#aaa'
            }, String(ii));
    
            svg.line({
                x1: svgSettings.leftPadding - leftLabelNegOffset,
                y1: (svgSettings.topPadding + innerHeight) - (oneTimeUnit * ii),
                x2: svgSettings.leftPadding + innerWidth + leftLabelNegOffset,
                y2: (svgSettings.topPadding + innerHeight) - (oneTimeUnit * ii),
                stroke: '#aaa',
                'stroke-width': 0.5
            });
        }

        // Max time
        svg.text({
            x: svgSettings.leftPadding - leftLabelNegOffset - 30,
            y: svgSettings.topPadding+ 7,
            'font-family': 'arial',
            'font-size': 15,
            stroke : '#ff0000',
            fill: '#ff0000'
        }, String(svgSettings.maxTaskSearchTime));

        svg.line({
            x1: svgSettings.leftPadding - leftLabelNegOffset,
            y1: svgSettings.topPadding,
            x2: svgSettings.leftPadding + innerWidth + leftLabelNegOffset,
            y2: svgSettings.topPadding,
            stroke: '#ff0000',
            'stroke-width': 1
        });

        // Min time
        svg.text({
            x: svgSettings.leftPadding - leftLabelNegOffset - 30,
            y: svgSettings.topPadding + (innerHeight  - (innerHeight * minMaxRatio))+ 7,
            'font-family': 'arial',
            'font-size': 15,
            stroke : '#ffaa00',
            fill: '#ffaa00'
        }, String(svgSettings.minTaskSearchTime));

        svg.line({
            x1: svgSettings.leftPadding - leftLabelNegOffset,
            y1: svgSettings.topPadding + (innerHeight  - (innerHeight * minMaxRatio)),
            x2: svgSettings.leftPadding + innerWidth + leftLabelNegOffset,
            y2: svgSettings.topPadding + (innerHeight  - (innerHeight * minMaxRatio)),
            stroke: '#ffaa00',
            'stroke-width': 1
        });



        // Construct SVG structure
        for (let i = 0; i < filteredTasks.length; ++i)
        {
            const task = filteredTasks[i];

            // Left offset for this particular column
            const currLeftOffset = svgSettings.leftPadding + ((svgSettings.columnWitdth * i) - (svgSettings.columnWitdth / 2));

            // Task timeline
            svg.line({
                x1: currLeftOffset,
                y1: (svgSettings.topPadding + innerHeight) - (oneTimeUnit * task.maxSearchTime),
                x2: currLeftOffset,
                y2: svgSettings.topPadding + innerHeight,
                stroke: '#0373fc',
                'stroke-width': taskTimelineWidth
            });

            const aaa = 'translate(' + String(currLeftOffset - 10) + ', ' + String(svgSettings.topPadding - 80) + ') rotate(45) ';
            // Number
            svg.text({
                x: 0,
                y: 0,
                'font-family': 'arial',
                'font-size': 20,
                stroke : '#000',
                fill: '#000',
                transform: aaa
            }, String(i + 1));

            // Name
            svg.text({
                x: currLeftOffset - 30,
                y: svgSettings.topPadding - 50,
                'font-family': 'arial',
                'font-size': 12,
                fill: '#aaa'
            }, task.name);

            // Type
            svg.text({
                x: currLeftOffset - 30,
                y: svgSettings.topPadding - 30,
                'font-family': 'arial',
                'font-size': 8,
                fill: '#000'
            }, task.type);

            const timelineDisOffset = parseFloat(taskTimelineWidth) / 2;

            // Draw submits
            for (let jj = 0; jj < task.submissions.length; ++jj)
            {
                
                const sub = task.submissions[jj];
                if (sub.correct == null)
                {
                    continue;
                }

                const radius = 5;
                const subLineWidth = 20;

                const crossSize = subLineWidth / 2;
                const crossLineWidth = 2;
                if (sub.correct)
                {
                    const centerY = svgSettings.topPadding + (innerHeight - (oneTimeUnit * sub.searchTime));
                    const crossWidth = crossSize;
                    const strokeWidth = 2;
                    this.drawCross(svg, currLeftOffset, centerY, crossWidth, crossWidth, sub.teamColor, strokeWidth);
                }
                else 
                {
                    svg.line({
                        x1: currLeftOffset - (subLineWidth / 2) + timelineDisOffset,
                        y1: svgSettings.topPadding + (innerHeight - (oneTimeUnit * sub.searchTime)),
                        x2: currLeftOffset + subLineWidth - (subLineWidth / 2)  + timelineDisOffset,
                        y2: svgSettings.topPadding + (innerHeight - (oneTimeUnit * sub.searchTime)),
                        stroke: sub.teamColor,
                        'stroke-width': crossLineWidth
                    });
                }

                
            }
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

    }

    /**
     * Draws into provided SVG cross with center in ('centerX', 'centerY')
     * that has provided 'width' and 'height', color of stroke is 'color' 
     * and stroke width is 'lineWidth'
     *
     * @param {*} refSvg 
     * @param {*} centerX 
     * @param {*} centerY 
     * @param {*} width 
     * @param {*} heigh 
     * @param {*} color 
     * @param {*} lineWidth 
     */
    static drawCross(refSvg, centerX, centerY, width, height, color, lineWidth)
    {
        refSvg.line({
            x1: centerX - (width / 2) - lineWidth,
            y1: centerY - (height / 2) - lineWidth,
            x2: centerX + (width / 2) - lineWidth,
            y2: centerY + (height / 2) - lineWidth,
            stroke: color,
            'stroke-width': lineWidth
        });

        refSvg.line({
            x1: centerX - (width / 2) - lineWidth,
            y1: centerY + (height / 2) - lineWidth,
            x2: centerX + (width / 2) - lineWidth,
            y2: centerY - (height / 2) - lineWidth,
            stroke: color,
            'stroke-width': lineWidth
        });
    }
}

module.exports = SvgBuilder;