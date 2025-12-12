"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { Group } from "@visx/group";
import { GridRows } from "@visx/grid";
import { AxisBottom, AxisRight } from "@visx/axis";
import { scaleLinear, scaleTime } from "@visx/scale";
import { LinePath } from "@visx/shape";
import { curveLinear } from "@visx/curve";

// Generic type for the history we receive
interface HistoryPoint {
    timestamp: number;
    yesPrice?: number;
    noPrice?: number;
    yesProb?: number;
    noProb?: number;
    probYes?: number;
    probNo?: number;
}

interface MarketSimpleChartProps {
    priceHistory: HistoryPoint[];
    mode?: "simple" | "advanced";
}

type TimeFrame = "1H" | "6H" | "1D" | "1W" | "1M" | "ALL";

const width = 1007;
const height = 250;
const margin = { top: 10, right: 50, bottom: 40, left: 10 };

export default function MarketSimpleChart({ priceHistory, mode = "simple" }: MarketSimpleChartProps) {
    const [timeFrame, setTimeFrame] = useState<TimeFrame>("ALL");
    const [hoveredPoint, setHoveredPoint] = useState<{ x: number; y: number; date: string } | null>(null);

    const { chartData, xScale, yScale, lastPoint } = useMemo(() => {
        const rawHistory = priceHistory ?? [];

        // Sort by timestamp
        const sorted = [...rawHistory].sort((a, b) => a.timestamp - b.timestamp);

        // Filter by timeframe
        const now = Date.now();
        let cutoff = 0;
        switch (timeFrame) {
            case "1H": cutoff = now - 60 * 60 * 1000; break;
            case "6H": cutoff = now - 6 * 60 * 60 * 1000; break;
            case "1D": cutoff = now - 24 * 60 * 60 * 1000; break;
            case "1W": cutoff = now - 7 * 24 * 60 * 60 * 1000; break;
            case "1M": cutoff = now - 30 * 24 * 60 * 60 * 1000; break;
            case "ALL": cutoff = 0; break;
        }

        const filtered = cutoff > 0 ? sorted.filter(p => p.timestamp >= cutoff) : sorted;

        // Transform to percentage format
        const data = filtered.map(p => {
            let probYes = p.probYes ?? p.yesProb;
            let probNo = p.probNo ?? p.noProb;

            if (probYes === undefined || probNo === undefined) {
                const yP = p.yesPrice ?? 0;
                const nP = p.noPrice ?? 0;
                const total = yP + nP;
                probYes = total > 0 ? (yP / total) : 0.5;
                probNo = 1 - probYes;
            }

            return {
                timestamp: p.timestamp,
                probYes: probYes,
            };
        });

        if (data.length === 0) {
            data.push({
                timestamp: Date.now(),
                probYes: 0.5,
            });
        }

        // Calculate scales
        const xMin = data[0].timestamp;
        const xMax = data[data.length - 1].timestamp;
        
        const xScale = scaleTime({
            domain: [xMin, xMax],
            range: [margin.left, width - margin.right],
        });

        // Y scale - 20% to 60% like Kalshi example
        const allValues = data.map(d => d.probYes * 100);
        const minVal = Math.min(...allValues);
        const maxVal = Math.max(...allValues);
        const padding = 5;
        const yMin = Math.max(0, Math.floor(minVal - padding));
        const yMax = Math.min(100, Math.ceil(maxVal + padding));

        const yScale = scaleLinear({
            domain: [yMax, yMin], // Inverted for SVG
            range: [margin.top, height - margin.bottom],
        });

        const lastPoint = data[data.length - 1];

        return { chartData: data, xScale, yScale, lastPoint };
    }, [priceHistory, timeFrame]);

    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const formatDate = (ts: number) => {
        const date = new Date(ts);
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    };

    const formatDateFull = (ts: number) => {
        const date = new Date(ts);
        return date.toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        }).toUpperCase();
    };

    // Calculate tick values for X axis (5 ticks)
    const xTicks = useMemo(() => {
        if (chartData.length === 0) return [];
        const timestamps = chartData.map(d => d.timestamp);
        const min = timestamps[0];
        const max = timestamps[timestamps.length - 1];
        const step = (max - min) / 4;
        return [min, min + step, min + step * 2, min + step * 3, max];
    }, [chartData]);

    return (
        <div className="w-full flex flex-col">
            {/* Timeframe buttons */}
            <div className="flex justify-end gap-1 mb-3 px-2">
                {(["1H", "6H", "1D", "1W", "1M", "ALL"] as TimeFrame[]).map((tf) => (
                    <button
                        key={tf}
                        onClick={() => setTimeFrame(tf)}
                        className={clsx(
                            "text-[11px] font-semibold px-3 py-1.5 rounded-md transition-colors",
                            timeFrame === tf
                                ? "bg-[var(--color-primary)] text-white"
                                : "bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text-main)]"
                        )}
                    >
                        {tf}
                    </button>
                ))}
            </div>

            {/* Chart Panel */}
            <div
                className="w-full rounded-xl border border-[var(--border-subtle)] relative"
                style={{
                    backgroundColor: "var(--bg-panel)",
                    padding: "20px",
                }}
            >
                <svg width={width} height={height}>
                    <Group>
                        {/* Grid rows */}
                        <GridRows
                            scale={yScale}
                            width={innerWidth}
                            height={innerHeight}
                            stroke="var(--border-subtle)"
                            strokeOpacity={0.3}
                            numTicks={5}
                        />

                        {/* Bottom Axis */}
                        <AxisBottom
                            top={height - margin.bottom}
                            scale={xScale}
                            tickValues={xTicks}
                            tickFormat={formatDate}
                            stroke="var(--border-subtle)"
                            tickStroke="transparent"
                            tickLabelProps={() => ({
                                fill: "var(--text-muted)",
                                fontSize: 11,
                                textAnchor: "middle",
                            })}
                        />

                        {/* Right Axis */}
                        <AxisRight
                            left={width - margin.right}
                            scale={yScale}
                            numTicks={5}
                            tickFormat={(v: any) => `${v}%`}
                            stroke="transparent"
                            tickStroke="transparent"
                            tickLabelProps={() => ({
                                fill: "var(--text-muted)",
                                fontSize: 11,
                                textAnchor: "start",
                                dx: 5,
                            })}
                        />

                        {/* Line path */}
                        <LinePath
                            data={chartData}
                            x={(d) => xScale(d.timestamp)}
                            y={(d) => yScale(d.probYes * 100)}
                            stroke="#3b82f6"
                            strokeWidth={2.5}
                            curve={curveLinear}
                        />

                        {/* Last point circle with pulse animation */}
                        {lastPoint && (
                            <>
                                <circle
                                    cx={xScale(lastPoint.timestamp)}
                                    cy={yScale(lastPoint.probYes * 100)}
                                    r={6}
                                    fill="#3b82f6"
                                    stroke="#fff"
                                    strokeWidth={2}
                                    style={{
                                        animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
                                    }}
                                />
                                {/* Date label */}
                                <text
                                    x={xScale(lastPoint.timestamp)}
                                    y={yScale(lastPoint.probYes * 100) + 25}
                                    fill="var(--text-muted)"
                                    fontSize={11}
                                    textAnchor="middle"
                                    fontWeight={500}
                                >
                                    {formatDateFull(lastPoint.timestamp)}
                                </text>
                            </>
                        )}

                        {/* Hover line (optional) */}
                        {hoveredPoint && (
                            <line
                                x1={hoveredPoint.x}
                                x2={hoveredPoint.x}
                                y1={margin.top}
                                y2={height - margin.bottom}
                                stroke="var(--border-subtle)"
                                strokeWidth={1}
                                strokeDasharray="4 4"
                            />
                        )}
                    </Group>
                </svg>

                <style jsx>{`
                    @keyframes pulse {
                        0%, 100% {
                            opacity: 1;
                        }
                        50% {
                            opacity: 0.5;
                        }
                    }
                `}</style>
            </div>
        </div>
    );
}
