import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type SalesPoint = { date: string; amount: number; orderCount?: number };

export default function AdminSalesChart({ data = [] }: { data?: SalesPoint[] }) {
  return (
    <div className="h-[300px] w-full" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
          <XAxis dataKey="date" tick={{ fill: "#888", fontSize: 12 }} tickMargin={10} tickFormatter={value => {
            const date = new Date(value);
            return `${date.getDate()}/${date.getMonth() + 1}`;
          }} />
          <YAxis tick={{ fill: "#888", fontSize: 12 }} tickMargin={10} tickFormatter={value => `${value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value}`} />
          <Tooltip formatter={(value: number) => [`${value} ج.م`, "المبيعات"]} labelFormatter={label => new Date(label as string).toLocaleDateString("ar-EG")} />
          <Area type="monotone" dataKey="amount" stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.2} strokeWidth={3} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
