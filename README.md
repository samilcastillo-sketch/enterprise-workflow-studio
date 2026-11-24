# FlowOps Studio — Enterprise Approval & Workflow Builder

Editor visual empresarial (BPMN-lite) para diseñar, validar y simular flujos de aprobación corporativos, ruteo de órdenes de compra, escalamientos SLA y sincronizaciones ERP.

## Funcionalidades Empresariales

- **Lienzo SVG Interactivo:** Arrastra nodos con *snap-to-grid*, conecta transiciones con curvas Bézier y selecciona nodos/aristas para editar propiedades.
- **Validador DAG & Linter Corporativo:** Detección automática de ciclos, nodos huérfanos/inalcanzables, múltiples inicios y ausencia de nodos terminales.
- **Simulador de Ejecución Condicional:** Evalúa reglas (`amountUsd > 25000`, `riskLevel == 'HIGH'`, `department == 'Cybersecurity'`) y resalta la ruta exacta paso a paso.
- **Undo/Redo (`Ctrl+Z` / `Ctrl+Y`) & Import/Export JSON:** Pila de historial reversible y portabilidad de blueprints.

## Ejecución y Pruebas

```bash
npm test
python3 -m http.server 8086 --directory src
```
