'use client';

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { format, formatDistanceToNow } from 'date-fns';

interface DataPoint {
  timestamp: number | Date;
  probability: number;
}

interface PriceHistoryChartProps {
  data: DataPoint[];
  range?: '1H' | '24H' | '7D' | 'ALL';
  color?: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  range?: '1H' | '24H' | '7D' | 'ALL';
}

export function CustomTooltip({ active, payload, range }: CustomTooltipProps) {
  if (!active || !payload || !payload[0]) return null;

  const data = payload[0].payload;
  const probability = Math.round(data.probability);
  const timestamp = new Date(data.timestamp);

  let dateFormat = 'MMM d, h:mm a';
  if (range === '1H') {
    dateFormat = 'h:mm a';
  } else if (range === '24H') {
    dateFormat = 'h:mm a';
  } else if (range === '7D') {
    dateFormat = 'EEE, MMM d';
  }

  return (
    <div
      style={{
        background: 'rgba(17, 25, 40, 0.95)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '8px',
        padding: '12px 16px',
        backdropFilter: 'blur(10px)',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)',
      }}
    >
      <div
        style={{
          fontSize: '24px',
          fontWeight: '700',
          color: '#ffffff',
          marginBottom: '4px',
          letterSpacing: '-0.5px',
        }}
      >
        {probability}%
      </div>
      <div
        style={{
          fontSize: '13px',
          color: 'rgba(255, 255, 255, 0.6)',
          fontWeight: '500',
        }}
      >
        {format(timestamp, dateFormat)}
      </div>
    </div>
  );
}

export function PriceHistoryChart({ data, range = '24H', color }: PriceHistoryChartProps) {
  if (!data || data.length === 0) return null;

  const firstValue = data[0].probability;
  const lastValue = data[data.length - 1].probability;
  const isPositive = lastValue >= firstValue || lastValue > 50;

  const lineColor = color || (isPositive ? '#00D2BE' : '#FF3B69');
  const gradientId = `gradient-${lineColor.replace('#', '')}`;

  const formatXAxis = (timestamp: any) => {
    const date = new Date(timestamp);
    
    if (range === '1H') {
      return format(date, 'h:mm a');
    } else if (range === '24H') {
      return format(date, 'ha');
    } else if (range === '7D') {
      return format(date, 'MMM d');
    }
    return format(date, 'MMM d');
  };

  const formattedData = data.map(point => ({
    ...point,
    timestamp: new Date(point.timestamp).getTime(),
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart
        data={formattedData}
        margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity={0.2} />
            <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
          </linearGradient>
        </defs>

        <CartesianGrid
          strokeDasharray="0"
          stroke="rgba(255, 255, 255, 0.05)"
          vertical={false}
          horizontal={true}
        />

        <XAxis
          dataKey="timestamp"
          tickFormatter={formatXAxis}
          axisLine={false}
          tickLine={false}
          tick={{ fill: 'rgba(255, 255, 255, 0.4)', fontSize: 12, fontWeight: 500 }}
          minTickGap={50}
          dy={8}
        />

        <YAxis
          domain={[0, 100]}
          hide={true}
        />

        <Tooltip
          content={<CustomTooltip range={range} />}
          cursor={{
            stroke: 'rgba(255, 255, 255, 0.2)',
            strokeWidth: 1,
            strokeDasharray: '0',
          }}
          position={{ y: 0 }}
          wrapperStyle={{ outline: 'none' }}
        />

        <Area
          type="monotone"
          dataKey="probability"
          stroke={lineColor}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          isAnimationActive={true}
          animationDuration={800}
          animationEasing="ease-out"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
