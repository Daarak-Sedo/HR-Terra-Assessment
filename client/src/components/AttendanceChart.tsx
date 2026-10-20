import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";

interface AttendancePoint {
  label: string;
  people: number;
}

export default function AttendanceChart({ data }: { data: AttendancePoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={112}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#edf0eb" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tick={{ fill: "#949a91", fontSize: 9 }}
        />
        <Tooltip
          cursor={{ fill: "#f5f7f3" }}
          contentStyle={{
            border: "1px solid #e9ebe6",
            borderRadius: 7,
            fontSize: 10,
          }}
        />
        <Bar
          dataKey="people"
          fill="#77a17c"
          radius={[4, 4, 0, 0]}
          barSize={25}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
