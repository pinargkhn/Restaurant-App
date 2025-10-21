// src/components/TopProductsChart.js
import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import './TopProductsChart.css'; // 👈 YENİ CSS İÇE AKTAR

export default function TopProductsChart({ data }) {
  
  if (!data || data.length === 0) {
    return <p className="chart-empty-text">Gösterilecek ürün verisi yok.</p>;
  }
  
  const chartData = data.map(item => ({
    name: item.name, 
    adet: item.qty 
  }));

  return (
    <div className="chart-responsive-wrapper"> 
      <ResponsiveContainer>
        <BarChart
          data={chartData}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          layout="vertical" 
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" />
          <YAxis 
              type="category" 
              dataKey="name" 
              width={120} 
              style={{ fontSize: '12px' }}
          /> 
          <Tooltip 
              cursor={{ fill: '#f0f0f0' }}
              formatter={(value) => [`${value} adet`, 'Satılan Adet']} 
          />
          {/* 🔹 Admin panelindeki tema rengini (indigo) kullan */}
          <Bar dataKey="adet" fill="var(--primary-indigo)" name="Satılan Adet" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}