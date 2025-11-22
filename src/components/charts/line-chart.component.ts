import { Component, ChangeDetectionStrategy, ElementRef, OnChanges, SimpleChanges, viewChild, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as d3 from 'd3';

export interface LineChartData {
  date: Date;
  value: number;
  label: string;
}

@Component({
  selector: 'app-line-chart',
  standalone: true,
  imports: [CommonModule],
  template: `<div #chart class="w-full h-64 text-xs relative"></div>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LineChartComponent implements OnChanges {
  chartContainer = viewChild.required<ElementRef<HTMLDivElement>>('chart');
  
  data = input.required<LineChartData[]>();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data'] && this.data()) {
      this.createChart();
    }
  }

  private createChart(): void {
    const element = this.chartContainer().nativeElement;
    d3.select(element).select('svg').remove();
    d3.select(element).select('.tooltip').remove();

    const data = this.data();
    if (!data || data.length === 0) return;

    const margin = { top: 20, right: 30, bottom: 40, left: 50 };
    const width = element.clientWidth - margin.left - margin.right;
    const height = 256 - margin.top - margin.bottom;

    const svg = d3.select(element)
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);
      
    // Tooltip
    const tooltip = d3.select(element).append("div")
      .attr("class", "tooltip")
      .style("opacity", 0)
      .style("position", "absolute")
      .style("background-color", "rgba(31, 41, 55, 0.9)") // bg-gray-800/90
      .style("border", "1px solid #4b5563") // border-gray-600
      .style("border-radius", "0.5rem") // rounded-lg
      .style("padding", "0.5rem")
      .style("color", "white")
      .style("pointer-events", "none");

    // X axis
    const x = d3.scaleTime()
      .domain(d3.extent(data, d => d.date) as [Date, Date])
      .range([0, width]);
    svg.append("g")
      .attr("transform", `translate(0, ${height})`)
      .call(d3.axisBottom(x).ticks(5))
      .selectAll('text')
      .style('fill', '#9ca3af');

    // Y axis
    const y = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.value) as number * 1.1]) // add 10% padding
      .range([height, 0]);
    svg.append("g")
      .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format("$.2f")))
      .selectAll('text')
      .style('fill', '#9ca3af');
      
    svg.selectAll("path.domain, .tick line")
      .style("stroke", "#4b5563");

    // Line
    svg.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "#2dd4bf") // teal-400
      .attr("stroke-width", 2.5)
      .attr("d", d3.line<LineChartData>()
        .x(d => x(d.date))
        .y(d => y(d.value))
      );

    // Dots
    svg.selectAll("dots")
      .data(data)
      .enter()
      .append("circle")
      .attr("fill", "#2dd4bf")
      .attr("stroke", "#115e59") // teal-800
      .attr("stroke-width", 2)
      .attr("cx", d => x(d.date))
      .attr("cy", d => y(d.value))
      .attr("r", 5)
      .on("mouseover", (event, d) => {
        tooltip.transition().duration(200).style("opacity", 1);
        tooltip.html(d.label)
          .style("left", (event.pageX + 15) + "px")
          .style("top", (event.pageY - 28) + "px");
      })
      .on("mouseout", () => {
        tooltip.transition().duration(500).style("opacity", 0);
      });
  }
}
