export const money = (n) =>
  '$' + Number(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 2 })
