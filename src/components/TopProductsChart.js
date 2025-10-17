// src/components/TopProductsChart.js

import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

export default function TopProductsChart({ data }) {
  
  if (!data || data.length === 0) {
    return <p className="text-gray-500 text-center py-4">Gösterilecek ürün verisi yok.</p>;
  }
  
  const chartData = data.map(item => ({
    name: item.name, 
    adet: item.qty 
  }));

  return (
    // 🚀 YÜKSEKLİK KÜÇÜLTÜLDÜ (350px yerine 250px önerilir)
    <div style={{ width: '100%', height: 250 }}> 
      <ResponsiveContainer>
        {/* Yatay Çubuk Grafik */}
        <BarChart
          data={chartData}
          // Grafiğin kenar boşluklarını düzenleyerek etiketlerin sığmasına yardımcı olur
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          layout="vertical" 
        >
          <CartesianGrid strokeDasharray="3 3" />
          
          {/* X ekseni: Satılan Adet (type="number" olmalı) */}
          <XAxis type="number" />
          
          {/* Y ekseni: Ürün İsimleri (Genişlik 120px olarak ayarlandı, uzun isimler için kritik) */}
          <YAxis 
              type="category" 
              dataKey="name" 
              width={120} 
              // Etiketlerin kesilmesini engellemek için metin ayarları eklendi
              style={{ fontSize: '12px' }}
          /> 
          
          <Tooltip 
              cursor={{ fill: '#f0f0f0' }}
              formatter={(value) => [`${value} adet`, 'Satılan Adet']} 
          />
          <Bar dataKey="adet" fill="#4f46e5" name="Satılan Adet" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}