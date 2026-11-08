// Textos de ejemplo 100% sintéticos (regla 1: cero datos reales de clientes).

export interface Sample {
  label: string;
  text: string;
}

export const SAMPLES: readonly Sample[] = [
  {
    label: "Contrato",
    text: "Contrato de prestación de servicios entre Distribuidora Aurora S.A. y Logística Norte. Las partes acuerdan una vigencia de 12 meses, renovable por acuerdo mutuo, con cláusula de confidencialidad.",
  },
  {
    label: "Factura vencida",
    text: "Factura F-2026-0412 por 18,400 MXN. El pago vence hoy; favor de liquidar de inmediato para evitar recargos. Cobro correspondiente a servicios de octubre.",
  },
  {
    label: "Reporte trimestral",
    text: "Reporte de resultados del tercer trimestre: los ingresos crecieron 8% y el margen operativo se mantuvo estable. Se adjuntan informes por región.",
  },
  {
    label: "Ambiguo",
    text: "Nota interna: revisar el documento adjunto la próxima semana y comentar observaciones generales.",
  },
  {
    label: "Simular falla",
    text: "[falla] Este texto hace que el modo demo simule un timeout de neo-model para ver el manejo de errores.",
  },
];
