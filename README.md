# Onda

Sismos en vivo, en español. Abre con el sismo M7.7 de Panamá (9 de octubre de 2026) y funciona con cualquier sismo reciente.

- **Ahora**: el sismo en un globo animado, réplicas en vivo (se actualizan cada minuto), la secuencia completa en cámara rápida y el pronóstico de réplicas.
- **Tú**: tu intensidad personal, tomada del ShakeMap del USGS en tu punto exacto y ajustada por piso, lugar y suelo. Las ondas P y S viajan hasta ti en el mapa.
- **Ciudades**: intensidad estimada en cada pueblo y cuánta gente sintió cada nivel.
- **Casa**: revisión guiada de daños con un veredicto claro.
- **Ciencia**: tipo de falla, profundidad, energía y cómo se calman las réplicas.

Todos los datos vienen en vivo de las APIs públicas del USGS. La ubicación nunca sale del teléfono.

Correr localmente: `python3 -m http.server 8790`, luego abre http://localhost:8790. Para otro sismo: `?e=<id del USGS>`.

Hecho por **vahprojects**.
