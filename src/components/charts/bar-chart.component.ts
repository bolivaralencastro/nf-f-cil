import { Component, ChangeDetectionStrategy, ElementRef, Input, OnChanges, SimpleChanges, viewChild, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as d3 from 'd3';

export interface ChartData {
  label: string;
  value: number;
}

@Component({
  selector: 'app-bar-chart',
  standalone: true,
  imports: [CommonModule],
  template: `<div #chart class="w-full h-64 text-xs"></div>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BarChartComponent implements OnChanges {
  chartContainer = viewChild.required<ElementRef<HTMLDivElement>>('chart');
  
  data = input.required<ChartData[]>();
  horizontal = input<boolean>(false);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data'] && this.data()) {
      this.createChart();
    }
  }

  private createChart(): void {
    const element = this.chartContainer().nativeElement;
    d3.select(element).select('svg').remove();

    const data = this.data();
    if (!data || data.length === 0) return;

    const margin = { top: 20, right: 20, bottom: 60, left: 50 };
    const width = element.clientWidth - margin.left - margin.right;
    const height = 256 - margin.top - margin.bottom; // 256px = h-64

    const svg = d3.select(element)
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    if (this.horizontal()) {
      this.createHorizontalChart(svg, width, height, data);
    } else {
      this.createVerticalChart(svg, width, height, data);
    }
  }

  private createVerticalChart(svg: any, width: number, height: number, data: ChartData[]) {
    const x = d3.scaleBand()
      .range([0, width])
      .domain(data.map(d => d.label))
      .padding(0.2);

    svg.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x))
      .selectAll('text')
      .attr('transform', 'translate(-10,0)rotate(-45)')
      .style('text-anchor', 'end')
      .style('fill', '#9ca3af');

    const y = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.value) || 0])
      .range([height, 0]);

    svg.append('g')
      .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format("$.2f")))
      .selectAll('text')
      .style('fill', '#9ca3af');
      
    svg.selectAll("path.domain, .tick line")
      .style("stroke", "#4b5563");

    svg.selectAll('rect')
      .data(data)
      .enter()
      .append('rect')
      .attr('x', d => x(d.label) as number)
      .attr('y', d => y(d.value))
      .attr('width', x.bandwidth())
      .attr('height', d => height - y(d.value))
      .attr('fill', '#2dd4bf');
  }

  private createHorizontalChart(svg: any, width: number, height: number, data: ChartData[]) {
    const y = d3.scaleBand()
      .range([0, height])
      .domain(data.map(d => d.label))
      .padding(0.1);

    svg.append('g')
      .call(d3.axisLeft(y))
      .selectAll('text')
      .style('fill', '#9ca3af');

    const x = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.value) || 0])
      .range([0, width]);

    svg.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat(d3.format("$.2f")))
      .selectAll('text')
      .style('fill', '#9ca3af');

    svg.selectAll("path.domain, .tick line")
      .style("stroke", "#4b5563");

    svg.selectAll('rect')
      .data(data)
      .enter()
      .append('rect')
      .attr('x', x(0))
      .attr('y', d => y(d.label) as number)
      .attr('width', d => x(d.value))
      .attr('height', y.bandwidth())
      .attr('fill', '#2dd4bf');
  }
}