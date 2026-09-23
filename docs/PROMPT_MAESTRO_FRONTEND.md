# PROMPT MAESTRO --- RECONSTRUCCIÓN DEL FRONTEND

## Sistema Web de Gestión de Rescate y Adopción Animal --- Fundación Amor de Cuatro Patas

**Versión:** 1.0 --- 23 de septiembre de 2026\
**Uso:** Instrucciones maestras para Claude / Claude Code\
**Estado del proyecto:** Backend v1.1 implementado; frontend debe
reconstruirse de forma limpia e integrarse contra el backend existente.

------------------------------------------------------------------------

# 0. INSTRUCCIÓN PRINCIPAL

Trabajarás sobre el proyecto **Sistema Web de Gestión de Rescate y
Adopción Animal --- Fundación Amor de Cuatro Patas**.

Tu tarea es **reconstruir el frontend del MVP interno** a partir de la
documentación funcional/técnica y del backend existente.

## Orden de autoridad de las fuentes

Cuando exista cualquier duda o contradicción, utiliza este orden:

1.  **Backend v1.1 real**: esquema PostgreSQL, constraints, RPC, RLS,
    Storage y Edge Functions.
2.  **Ficha Maestra v7**: requerimientos, reglas de negocio, alcance y
    decisiones funcionales.
3.  **Este PROMPT_MAESTRO_FRONTEND.md**: especificación fina de UX/UI,
    navegación y comportamiento esperado.
4.  **PLAN_PRUEBAS_ACEPTACION.md**, cuando se entregue: criterios
    verificables.
5.  **Frontend v1**: solamente referencia visual/estructural.
6.  Prototipos anteriores: solamente inspiración visual.

Si documentación y backend difieren en una firma, nombre de campo,
constraint o comportamiento técnico, **no inventes una solución ni
modifiques el backend silenciosamente**. Detén ese punto, documenta la
discrepancia y solicita decisión.

## Regla fundamental

**No reconstruyas el frontend parcheando incrementalmente las versiones
experimentales posteriores.**

Construye una base limpia y coherente. Puedes reutilizar componentes
visuales o código del frontend v1 solo si son compatibles con el backend
v1.1 y con estas especificaciones.

------------------------------------------------------------------------

# 1. FORMA DE TRABAJO OBLIGATORIA

## 1.1 Primera ejecución: SOLO ANÁLISIS

Antes de modificar cualquier archivo:

1.  Lee este documento completo.
2.  Lee la Ficha Maestra v7.
3.  Inspecciona el backend v1.1 completo.
4.  Identifica:
    -   tablas y claves;
    -   catálogos;
    -   constraints;
    -   RPC y firmas reales;
    -   Edge Functions y contratos de entrada/salida;
    -   políticas RLS;
    -   Storage;
    -   estructura Google Drive;
    -   autenticación;
    -   archivos/configuración que contienen o podrían contener
        secretos.
5.  Inspecciona el frontend v1 solo como referencia.
6.  Entrega un **plan de implementación por etapas**.
7.  Entrega una **matriz de integración** con:
    `Pantalla/acción → tabla/RPC/Edge Function → datos de entrada → resultado esperado`.
8.  Señala cualquier contradicción o riesgo.

**No escribas ni modifiques código hasta recibir autorización expresa.**

## 1.2 Durante la implementación

Trabaja por etapas pequeñas y comprobables. Después de cada etapa:

-   explica qué archivos modificaste;
-   explica qué funcionalidad implementaste;
-   indica qué RPC/tabla/Edge Function consume;
-   ejecuta las verificaciones estáticas disponibles;
-   informa cualquier punto que no hayas podido comprobar realmente;
-   no declares una integración "probada" si solo revisaste código.

## 1.3 No hacer

No debes:

-   rediseñar el backend por comodidad del frontend;
-   crear tablas/campos/estados inexistentes;
-   modificar RLS para "hacer funcionar" una pantalla sin análisis;
-   abrir datos a `anon`;
-   utilizar `service_role` en el navegador;
-   almacenar secretos en JS versionado;
-   implementar reglas transaccionales críticas en JavaScript si ya
    existe una RPC;
-   usar eliminación física de registros históricos;
-   volver a introducir localStorage como base de datos;
-   implementar postulaciones/cuestionarios/puntajes;
-   implementar portal público;
-   integrar una API de IA;
-   crear flyers automáticos;
-   publicar automáticamente en redes sociales;
-   inventar folios o campos documentales;
-   asumir que un error de integración requiere cambiar la BD.

------------------------------------------------------------------------

# 2. OBJETIVO DEL FRONTEND

El frontend será una aplicación web interna, sencilla, didáctica y
visualmente agradable para Presidenta y Tesorera de la Fundación,
inicialmente con el mismo nivel de acceso.

Debe permitir operar el sistema sin conocimiento técnico y mantener la
trazabilidad del proceso completo.

Tecnologías esperadas:

-   HTML5;
-   CSS3;
-   Bootstrap;
-   JavaScript;
-   Bootstrap Icons;
-   Supabase JS;
-   navegador moderno.

No introducir frameworks grandes sin justificar previamente la
necesidad.

------------------------------------------------------------------------

# 3. PRINCIPIOS DE UX

1.  **Claridad antes que densidad.**
2.  Acciones principales visibles.
3.  Formularios agrupados por significado.
4.  Evitar pantallas vacías: usar estados vacíos explicativos con icono
    y acción.
5.  No utilizar gráficos decorativos solo para ocupar espacio.
6.  Confirmar acciones relevantes, pero no saturar de confirmaciones.
7.  Los mensajes deben ser comprensibles para una usuaria no técnica.
8.  Errores técnicos pueden registrarse en consola, pero la UI debe
    traducirlos cuando sea posible.
9.  Un clic debe producir como máximo una operación.
10. Toda acción asíncrona debe mostrar estado de carga.
11. No permitir múltiples envíos mientras una operación está en curso.
12. **Nunca deshabilitar inputs antes de capturar sus
    valores/FormData.**
13. Tras éxito, refrescar solo lo necesario y conservar contexto cuando
    sea útil.
14. Botones destructivos o de desactivación deben distinguirse
    visualmente.
15. En formularios largos, marcar claramente obligatorios y opcionales.
16. La interfaz debe ser responsive para PC, tablet y teléfono.

------------------------------------------------------------------------

# 4. IDENTIDAD VISUAL

## 4.1 Paleta

-   Azul petróleo principal: `#315D6D`
-   Azul petróleo oscuro: `#244753`
-   Azul claro: `#E8F1F4`
-   Rosa/fucsia Fundación: `#E91E63`
-   Rosa claro: `#FCE8EF`
-   Burdeos de apoyo: `#9F171A`
-   Fondo general: `#F7F9FA`
-   Blanco: `#FFFFFF`
-   Texto principal: `#263238`
-   Texto secundario: `#6B7880`

Colores semánticos estándar: - verde: éxito/disponibilidad; - ámbar:
advertencia/pendiente; - rojo: error/acción delicada; - azul:
información.

No convertir toda la interfaz en rosado. El azul petróleo estructura el
sistema; el fucsia identifica a la Fundación y sirve como acento.

## 4.2 Tipografía y componentes

-   `Inter` si está disponible; fallback `system-ui`.
-   Radios moderados: aproximadamente 10--12 px.
-   Sombras suaves.
-   Cards limpias.
-   Iconografía consistente con Bootstrap Icons.
-   Sidebar azul petróleo oscuro.
-   Área de contenido clara/blanca.
-   Logo en espacio reemplazable; no incrustar una captura como activo
    definitivo.

## 4.3 Botones

Jerarquía:

-   **Primario:** azul petróleo. Guardar, Registrar, Confirmar, Crear.
-   **Secundario:** blanco/borde azul. Cancelar, Volver, acciones
    alternativas.
-   **Marca/destacado:** fucsia solo cuando sea útil para identidad o
    acción destacada.
-   **Éxito:** verde para acciones positivas específicas.
-   **Peligro:** rojo únicamente para desactivar o acciones realmente
    delicadas.
-   **Enlace/terciario:** botón sin relleno para "Ver", "Abrir", etc.

Todos los botones con icono cuando aporte comprensión.

Durante envío: - deshabilitar botón; - mostrar spinner; - cambiar texto
a "Guardando...", "Subiendo...", etc.; - no bloquear valores antes de
leerlos; - restaurar estado ante error.

------------------------------------------------------------------------

# 5. ESTRUCTURA GENERAL

## 5.1 Login

Pantalla limpia con identidad Fundación.

Campos: - correo; - contraseña.

Acciones: - `Ingresar`.

Comportamiento: - Supabase Auth es la única autenticación; - no crear
autenticación local; - si sesión válida, entrar al Dashboard; - si
usuario interno está inactivo, impedir operación según backend/RLS; -
mensajes claros para credenciales incorrectas.

## 5.2 Layout autenticado

Sidebar: 1. Panel principal 2. Animales 3. Hogares temporales 4.
Adopciones 5. Gastos 6. Proyectos de esterilización 7. Documentos 8.
Informes 9. Configuración

Zona superior: - nombre de usuaria; - acceso a cuenta/configuración; -
cerrar sesión.

Sidebar responsive: - escritorio visible; - móvil colapsable.

La opción activa debe quedar claramente marcada.

------------------------------------------------------------------------

# 6. DASHBOARD / PANEL PRINCIPAL

No mostrar gráficos decorativos.

## 6.1 Encabezado

Bloque de bienvenida: - saludo breve; - texto como "Resumen operativo de
la Fundación"; - fecha actual opcional.

## 6.2 KPI definitivos

Mostrar exactamente estos cinco:

1.  **Animales activos**
2.  **En tratamiento**
3.  **En hogar temporal**
4.  **Adoptados**
5.  **Rescatados este mes**

No mostrar KPI "Disponible para adopción".

### Definición de Animales activos

Es un concepto operativo de interfaz:

`animales con registro activo cuyo estado actual NO sea Adoptado`.

**No modificar `ANIMAL.activo` al adoptar.** Un animal adoptado sigue
conservándose históricamente.

## 6.3 KPI clickeables

Cada tarjeta completa debe ser clickeable, accesible por teclado y
mostrar cursor/feedback hover.

Destino: - Animales activos → Animales filtrado excluyendo Adoptado. -
En tratamiento → estado En tratamiento. - En hogar temporal → estado En
hogar temporal. - Adoptados → estado Adoptado. - Rescatados este mes →
fecha_rescate dentro del mes actual.

Al navegar, el filtro debe verse aplicado; no solo mostrar resultados
filtrados invisiblemente.

## 6.4 Bloques complementarios

Mostrar información operativa útil, por ejemplo: - próximos controles
sanitarios; - hogares actualmente ocupados.

No llenar la pantalla con métricas sin utilidad.

------------------------------------------------------------------------

# 7. MÓDULO ANIMALES

## 7.1 Encabezado

Título: `Animales`

Acciones: - `+ Registrar animal` - selector `Tarjetas | Lista`

Filtros: - búsqueda general; - estado; - especie; - sexo si aporta; -
búsqueda por microchip.

La búsqueda debe admitir al menos nombre y microchip.

## 7.2 Vista tarjetas

Tarjetas compactas, no gigantes.

Cada card: - fotografía principal o placeholder; - nombre o
identificación; - especie; - sexo; - rango etario si existe; - estado; -
microchip si existe; - badge de información relevante.

**Toda la tarjeta debe abrir la ficha del animal**, excepto controles
internos que tengan acción propia.

Debe funcionar inmediatamente después de renderizar, sin requerir
cambiar primero a lista.

## 7.3 Vista lista

Tabla/listado responsive con: - foto pequeña; - nombre; - especie; -
sexo; - estado; - microchip; - fecha rescate; - acción `Ver ficha`.

Fila o acción debe abrir la misma ficha.

El selector Tarjetas/Lista debe mostrar claramente cuál vista está
activa.

## 7.4 Representación especial de hogar temporal

Backend mantiene un solo estado formal.

Si el animal está en `En hogar temporal`, la UI puede mostrar además un
indicador visual:

`💚 Disponible para adopción`

como **información visual complementaria**, no como segundo estado
persistido.

No guardar este indicador en la BD ni cambiar el catálogo.

------------------------------------------------------------------------

# 8. REGISTRAR ANIMAL

## 8.1 Campos

Formulario alineado exactamente con `ANIMAL` y la firma real de
`registrar_animal`.

Debe contemplar según backend: - nombre; - especie; - rango etario; -
sexo; - tamaño; - fecha nacimiento; - fecha rescate; - lugar rescate; -
características; - personalidad; - historia rescate; - observaciones; -
microchip; - situación Registro Nacional; - fotografía principal.

No incluir: - código interno; - estado inicial seleccionable; - URL
manual de Drive.

El estado inicial lo define `registrar_animal`: **Rescatado**.

## 8.2 Microchip

Opcional.

Si existe: - exactamente 15 dígitos; - no agregar espacios/guiones; -
backend conserva unicidad en rescate.

Situación Registro Nacional: - Inscrito; - No inscrito; - No
verificado; - nulo si corresponde según backend.

## 8.3 Fotografía principal

Una fotografía principal.

Antes de Storage: - optimizar; - convertir a WebP; - dimensión máxima
razonable (referencia: 1400 px); - calidad suficiente para interfaz; -
respetar límite del bucket.

Ruta: `animales/{id_animal}/principal.webp`

Guardar solamente path en BD.

## 8.4 Flujo correcto

1.  Capturar/validar todos los valores.
2.  Deshabilitar envío.
3.  Ejecutar RPC `registrar_animal` con **firma real completa**.
4.  Obtener `id_animal`.
5.  Solicitar `crear-carpeta-animal`.
6.  Si hay foto, optimizar/subir y actualizar `foto_principal_path`.
7.  Informar éxito.
8.  Refrescar listado/abrir ficha según UX definida.

Si Drive falla: - **no borrar el animal**; - informar que animal fue
registrado pero carpeta Drive no pudo crearse; - permitir reintento
futuro.

Si foto falla después de registrar: - **no presentar el proceso como
registro completamente fallido**; - informar "Animal registrado; no fue
posible cargar la fotografía"; - no incentivar un segundo registro
duplicado.

------------------------------------------------------------------------

# 9. FICHA INTEGRAL DEL ANIMAL

Encabezado: - foto; - nombre; - especie/sexo; - estado actual; -
microchip si existe; - acciones contextuales.

Pestañas EXACTAS:

1.  Resumen
2.  Salud
3.  Hogares
4.  Adopción
5.  Gastos
6.  Archivos
7.  Historial
8.  Difusión

La pestaña seleccionada debe quedar visualmente marcada.

------------------------------------------------------------------------

# 10. RESUMEN DEL ANIMAL

Mostrar datos principales en bloques legibles.

Acciones: - `Editar información` - `Cambiar estado`, cuando corresponda.

Edición genérica solo para datos descriptivos permitidos.

**No editar directamente desde formulario genérico:** - estado; -
permanencia; - adopción.

Esos procesos usan RPC específicas.

## Cambio de estado

Usar `cambiar_estado_animal`.

No permitir seleccionar libremente estados que el backend reserva para
procesos específicos.

Mostrar motivo/observación cuando corresponda.

------------------------------------------------------------------------

# 11. SALUD

No existe como módulo principal.

Dentro de ficha:

Listado cronológico de atenciones: - fecha; - tipo; - veterinario; -
tratamiento; - medicamento; - próximo control; - observaciones.

Acción: `+ Registrar atención`

El catálogo real utiliza: `TIPO_ATENCION_SANITARIA.id_tipo_atencion`

No inferir nombres de PK dinámicamente.

Registrar una atención **no cambia automáticamente el estado a En
tratamiento**.

Próximo control \>= fecha de atención.

Mostrar próximo control de forma destacada si está pendiente/próximo.

------------------------------------------------------------------------

# 12. HOGARES TEMPORALES

## 12.1 Módulo general

Mostrar hogares en cards/listado.

Datos: - responsable; - teléfono; - email; - dirección; -
observaciones; - activo; - cantidad de animales alojados actualmente.

No mostrar capacidad máxima.

Acciones: - `+ Nuevo hogar` - `Editar` - `Asignar animal` - ver animales
alojados.

## 12.2 Desde ficha animal

Pestaña Hogares: - hogar actual si existe; - fecha ingreso; - historial
de permanencias; - `Ingresar a hogar`; - `Cambiar de hogar`; -
`Finalizar permanencia`.

RPC obligatorias: - `ingresar_hogar_temporal`; -
`cambiar_hogar_temporal`; - `finalizar_hogar_temporal`.

No insertar permanencias directamente si la operación corresponde a
estas reglas.

Al ingresar: - backend establece En hogar temporal.

Al cambiar: - conservar permanencia anterior.

Al finalizar: - solicitar nueva situación válida según RPC.

------------------------------------------------------------------------

# 13. ADOPCIONES Y ADOPTANTES

## 13.1 Módulo

Subsecciones: - `Adopciones` - `Adoptantes`

No incluir: - postulaciones; - cuestionarios; - puntajes; - ranking de
adoptantes.

## 13.2 Registrar adopción

Puede iniciarse: - desde ficha animal; - desde módulo Adopciones.

Debe utilizar `registrar_adopcion`.

Debe seleccionar/crear adoptante según flujo implementado.

La adopción: - relaciona animal + adoptante; - establece Adoptado; -
cierra hogar temporal activo si corresponde.

No modificar estas tablas manualmente como sustituto de RPC.

## 13.3 Adoptantes

Datos reales del modelo: - nombre; - RUT; - teléfono; - email; -
dirección; - observaciones.

RUT debe respetar normalización definida por backend.

## 13.4 Seguimientos

Dentro del detalle de adopción.

Acción: `+ Registrar seguimiento`

Usar `registrar_seguimiento`.

Valores de `medio_contacto` deben ser **exactamente los admitidos por
backend**: - `WhatsApp` - `Telefono` - `Correo` - `Visita` - `Otro`

La etiqueta visual puede decir "Teléfono", pero el valor enviado debe
ser `Telefono`.

No enviar `Email` si backend espera `Correo`.

Fecha seguimiento no anterior a adopción.

## 13.5 Devolución

Acción claramente diferenciada: `Registrar devolución`

Usar `registrar_devolucion`.

Nunca borrar adopción anterior.

Solicitar nueva situación del animal según firma real.

------------------------------------------------------------------------

# 14. GASTOS

## 14.1 Listado

Mostrar: - fecha; - categoría; - descripción; - monto total; - monto
asignado; - parte general/restante cuando corresponda.

Filtros: - período; - categoría; - animal si corresponde.

Acción: `+ Registrar gasto`

## 14.2 Tipos operativos

Un gasto puede ser: - totalmente general; - asignado a un animal; -
compartido entre varios animales; - parcialmente asignado, dejando resto
general.

## 14.3 Formulario

Campos: - fecha; - categoría; - descripción; - monto; - observaciones; -
tipo/asignaciones.

Para asignaciones: - animal; - monto asignado; - permitir agregar varias
filas; - mostrar suma asignada; - mostrar restante.

Validación:

`suma asignada <= monto total`

**La igualdad es válida.**

Ejemplo: - total 50.000; - asignaciones 20.000 + 30.000; - válido.

No usar `>=` como rechazo.

RPC: `asignar_gasto_animal`.

## 14.4 Atomicidad

Si el backend actual no dispone de una RPC que cree GASTO + todas las
asignaciones en una sola transacción, no inventar que el proceso es
atómico.

Implementar UX prudente y documentar este riesgo. Si se considera
necesario mejorar backend, proponerlo separadamente antes de
modificarlo.

------------------------------------------------------------------------

# 15. ARCHIVOS DEL ANIMAL

Pestaña Archivos: - lista de archivos relacionados; - categoría; -
nombre; - fecha documento; - descripción; - acción `Abrir en Drive`; -
`+ Subir archivo`.

No almacenar binario en PostgreSQL.

Usar Edge Function `subir-archivo-drive`.

Al abrir: usar `obtener-link-archivo`.

El contrato real de respuesta debe inspeccionarse. En la implementación
conocida el enlace se encuentra bajo:

`archivo.url`

No asumir `data.url` sin verificar la Edge Function real.

Mostrar progreso/estado de carga y evitar doble envío.

------------------------------------------------------------------------

# 16. DIFUSIÓN

Dentro de ficha animal.

No usar API de IA.

Generar:

1.  **Texto base editable**
2.  **Prompt estructurado editable**

Acciones: - `Copiar texto` - `Copiar prompt` - opcional `Regenerar`
desde datos actuales.

Utilizar solamente información autorizada: - nombre; - edad/rango; -
sexo; - personalidad; - historia; - características; - requisitos de
adopción si existe una fuente real; - contacto institucional autorizado.

No incluir innecesariamente: - RUT; - direcciones privadas; - teléfono
de adoptantes; - datos personales sensibles.

No generar flyer.

------------------------------------------------------------------------

# 17. PROYECTOS DE ESTERILIZACIÓN

## 17.1 Listado

Cards/lista con: - nombre; - estado; - período; - entidad financiante si
existe; - cantidad de animales registrados.

Acción: `+ Nuevo proyecto`

No incluir meta/cupo objetivo de animales.

## 17.2 Crear proyecto

Usar campos reales de `PROYECTO_ESTERILIZACION`: - estado; - nombre; -
fecha postulación; - fecha inicio; - fecha fin; - responsable; - entidad
financiante; - descripción; - observaciones.

No pedir URL de Drive.

Después de crear: solicitar `crear-carpeta-proyecto`.

Si Drive falla: - proyecto permanece creado; - informar y permitir
reintento.

## 17.3 Detalle del proyecto

Encabezado visual con: - nombre; - estado; - fechas; - resumen.

Pestañas EXACTAS:

1.  Información
2.  Nómina
3.  Profesionales
4.  Documentación

------------------------------------------------------------------------

# 18. NÓMINA DE ESTERILIZACIÓN

## 18.1 Listado

Columnas:

-   Código
-   Especie
-   Sexo
-   Microchip
-   Registro Nacional
-   Fecha
-   Lugar
-   Profesional(es)
-   Documento
-   Acciones

Documento: - `Abrir PDF` si existe; - cuando se implemente reemplazo
controlado: `Abrir | Reemplazar`.

Acción principal: `+ Agregar animal`

Exportación: `Exportar Excel` cuando se implemente.

## 18.2 Agregar animal

Campos reales: - código; - especie; - rango etario; - sexo; - fecha
nacimiento; - características; - sector origen; - fecha
esterilización; - lugar esterilización; - microchip; - Registro
Nacional; - observaciones.

`codigo` es un código interno del proyecto y **no es microchip**.

Puede sugerirse: `EST-001`, `EST-002`, etc., pero debe ser editable.

## 18.3 Profesional(es) en el mismo flujo

Al agregar animal a nómina, solicitar también profesional(es).

El modelo permite **uno o más profesionales**.

Para cada profesional: - seleccionar profesional existente; - indicar
función; - permitir agregar otro; - permitir creación rápida de
profesional si no existe.

No reducir el modelo permanentemente a un único profesional.

## 18.4 Documento PDF en el mismo flujo

Al agregar animal, solicitar ficha digitalizada PDF.

Flujo conceptual esperado:

1.  crear `ANIMAL_ESTERILIZACION`;
2.  crear relación(es) `ESTERILIZACION_PROFESIONAL`;
3.  cargar PDF mediante Edge Function;
4.  registrar `ARCHIVO`;
5.  asociar mediante `ESTERILIZACION_ARCHIVO`.

Ubicación Drive: `Proyecto / Animales / {codigo}.pdf`

No crear carpeta individual por animal.

### Importante

El frontend debe exigir PDF según decisión funcional actual, pero **no
debe afirmar que existe garantía server-side si el backend aún no la
implementa**.

Existe un pendiente conocido: - validar PDF exclusivamente también en
servidor; - impedir múltiples fichas activas para la misma
esterilización o implementar reemplazo controlado.

No modificar backend silenciosamente para resolverlo. Reportar/proponer
solución.

------------------------------------------------------------------------

# 19. PROFESIONALES

Pestaña Profesionales del proyecto:

No existe relación directa Proyecto--Profesional.

Derivar profesionales a través de:

`PROYECTO → ANIMAL_ESTERILIZACION → ESTERILIZACION_PROFESIONAL → PROFESIONAL`

Mostrar: - nombre; - profesión; - contacto; - funciones; - cantidad de
esterilizaciones del proyecto.

Los profesionales son reutilizables entre proyectos.

Formulario profesional: - nombre; - profesión; - teléfono; - email; -
observaciones.

------------------------------------------------------------------------

# 20. DOCUMENTACIÓN DE PROYECTO

Pestaña Documentación: - archivos generales del proyecto; -
`+ Subir documento`; - abrir en Drive.

Estos documentos van a subcarpeta `Documentación`.

No confundir con las fichas PDF individuales, que van a `Animales`.

------------------------------------------------------------------------

# 21. MÓDULO DOCUMENTOS

Buscador transversal.

No crear editor documental.

Mostrar registros `ARCHIVO` y contexto asociado.

Filtros: - texto/nombre; - categoría; - fecha; - contexto/tipo; -
animal/proyecto cuando sea viable.

Acciones: - `Abrir en Drive`.

Puede existir acción `Subir documento` general cuando el contexto sea
Fundación y el backend lo soporte.

No mostrar `id_externo` como dato útil para la usuaria.

------------------------------------------------------------------------

# 22. INFORMES

## 22.1 Diseño

Pantalla con tarjetas de tipos de informe.

Ejemplos: - Animales - Adopciones - Atenciones sanitarias - Hogares
temporales - Gastos - Esterilizaciones

Cuando se selecciona una tarjeta: - debe quedar marcada; -
fondo/borde/indicador visual persistente; - no repetir innecesariamente
un título abajo tipo "Informe seleccionado: X".

Los filtros debajo corresponden al informe seleccionado.

## 22.2 Filtros

Los informes deben ser configurables por la usuaria.

Aplicar los filtros pertinentes a cada tipo: - fecha desde/hasta; -
especie; - estado; - sexo; - rango etario; - categoría; - animal; -
proyecto; - otros campos reales que aporten.

No mostrar filtros que no tienen sentido para ese informe.

## 22.3 Resultado

Mostrar tabla clara y total/resumen cuando corresponda.

Acciones: - `Generar/Aplicar filtros` - `Limpiar filtros` -
`Exportar CSV/Excel` según implementación disponible -
`Imprimir / Guardar PDF` mediante impresión del navegador cuando
corresponda.

No inventar cifras ni datos derivados sin fuente.

------------------------------------------------------------------------

# 23. CONFIGURACIÓN

Subsecciones:

1.  Mi cuenta
2.  Usuarios
3.  Catálogos
4.  Sistema, solo si existen opciones técnicas necesarias

La sección seleccionada debe quedar visualmente marcada.

## 23.1 Mi cuenta

Mostrar: - nombre; - email desde Auth; - cambiar contraseña si flujo de
Supabase lo permite; - cerrar sesión.

No duplicar email en `public.usuario`.

## 23.2 Usuarios

Mostrar: - nombre; - email cuando pueda obtenerse de forma segura por el
flujo existente; - estado activo/inactivo; - fecha registro si
corresponde.

Acciones: - `Invitar usuario` - `Activar` - `Desactivar`

Invitación: Edge Function `invitar-usuario`.

Activación: RPC `activar_usuario`.

Desactivación: RPC `desactivar_usuario`.

No permitir que el cliente evada RN-59.

## 23.3 Catálogos

Gestionar catálogos reales.

Antes de construir formularios genéricos, inspeccionar las columnas de
cada tabla.

**No asumir que todos tienen exactamente `nombre + descripcion`.**

Ejemplos: - ESTADO usa `nombre_estado`; - RANGO_ETARIO incluye edades; -
TIPO_ATENCION_SANITARIA PK `id_tipo_atencion`.

Preferir configuración explícita por catálogo antes que nombres
dinámicos frágiles.

Acciones: - agregar; - editar; - activar/desactivar si backend/RLS lo
permiten.

Evitar eliminación física.

------------------------------------------------------------------------

# 24. ESTADOS VACÍOS

Cada módulo debe tener un estado vacío útil.

Ejemplo Animales: - icono; - "Aún no hay animales registrados"; - texto
breve; - botón `Registrar primer animal`.

Ejemplo Gastos: - "No hay gastos que coincidan con los filtros".

Diferenciar: - sin datos; - sin resultados por filtro; - error de carga.

------------------------------------------------------------------------

# 25. MODALES Y FORMULARIOS

-   título claro;
-   botón cerrar;
-   `Cancelar`;
-   acción primaria;
-   foco inicial razonable;
-   Escape/cierre cuando no se esté procesando;
-   no cerrar durante una operación crítica sin advertencia;
-   mantener errores junto al campo cuando sea posible.

No anidar modales de forma inestable. Si una creación rápida conduce a
otra operación, conservar contexto explícitamente.

------------------------------------------------------------------------

# 26. MANEJO DE ERRORES

Crear manejo consistente.

Ejemplos de mensajes:

-   red: "No fue posible conectar con el servicio. Intenta nuevamente."
-   validación: indicar campo concreto;
-   duplicidad microchip: explicar que ya existe;
-   Drive: distinguir registro exitoso de fallo documental;
-   Auth: mensaje claro sin exponer detalles sensibles.

En desarrollo: `console.error()` puede conservar el objeto técnico.

No mostrar al usuario final únicamente:
`Edge Function returned a non-2xx status code`.

Intentar leer el body de error de la función y presentar su mensaje
seguro.

------------------------------------------------------------------------

# 27. PREVENCIÓN DE DOBLE SUBMIT

Patrón obligatorio:

``` text
1. prevenir submit normal;
2. capturar valores/FormData;
3. validar;
4. conservar archivos/valores necesarios en variables;
5. marcar operación como ocupada;
6. deshabilitar botón de envío;
7. ejecutar operación;
8. procesar resultado;
9. restaurar estado o cerrar formulario.
```

No:

``` text
deshabilitar todos los inputs → new FormData(form)
```

porque los controles disabled no participan en FormData.

Para operaciones creadoras, impedir que doble clic genere duplicados.

------------------------------------------------------------------------

# 28. CATÁLOGOS Y CONSULTAS

No generar nombres de PK con fórmulas como:

`"id_" + nombreTabla`

Mantener metadatos explícitos:

`tabla → PK → campo visible → columnas`.

Esto evita errores como esperar `id_tipo_atencion_sanitaria` cuando la
PK real es `id_tipo_atencion`.

------------------------------------------------------------------------

# 29. SUPABASE Y SEGURIDAD

-   sesión real Supabase;
-   respetar RLS;
-   usar `anon key` pública solamente como corresponde al cliente;
-   nunca `service_role`;
-   nunca secretos OAuth;
-   no exponer refresh token;
-   no modificar políticas para evitar errores sin comprender la causa.

Realizar al final una auditoría de privilegios RPC. Si se detecta
`EXECUTE` para `anon` en funciones de negocio que no deberían ser
públicas, **reportarlo antes de cambiarlo**, salvo autorización expresa.

------------------------------------------------------------------------

# 30. GOOGLE DRIVE

Estructura:

``` text
Amor de Cuatro Patas - Sistema/
├── Animales/
├── Proyectos de Esterilización/
│   └── {id} - {nombre}/
│       ├── Documentación/
│       └── Animales/
└── Documentación Fundación/
```

Animal rescatado: - carpeta individual.

Proyecto: - carpeta principal + Documentación + Animales.

Animal de esterilización: - no carpeta individual; - PDF directamente en
`Animales`.

Los archivos permanecen privados.

No usar "cualquiera con el enlace".

------------------------------------------------------------------------

# 31. RESPONSIVE

## Escritorio

Sidebar fijo, contenido amplio.

## Tablet

Sidebar colapsable si falta espacio; tablas pueden desplazarse
horizontalmente.

## Móvil

-   sidebar offcanvas;
-   cards a una columna;
-   formularios a una columna;
-   botones importantes accesibles;
-   tablas convertibles a cards o scroll horizontal controlado.

No sacrificar funciones por responsive.

------------------------------------------------------------------------

# 32. ACCESIBILIDAD BÁSICA

-   labels asociados;
-   contraste adecuado;
-   botones no dependientes solo del color;
-   `aria-label` en iconos sin texto;
-   foco visible;
-   cards clickeables también accesibles mediante teclado;
-   mensajes no basados únicamente en color.

------------------------------------------------------------------------

# 33. FUERA DE ALCANCE --- NO IMPLEMENTAR

-   portal público;
-   app móvil nativa;
-   contabilidad completa;
-   inventario;
-   tienda;
-   donaciones;
-   cuestionarios/postulaciones;
-   scoring de adoptantes;
-   IA integrada;
-   generación automática de imágenes;
-   flyers;
-   publicación automática en redes;
-   sistema clínico veterinario completo;
-   eliminación física de históricos;
-   metas/cupos de proyectos de esterilización;
-   persistencia local como fuente de verdad.

------------------------------------------------------------------------

# 34. ARCHIVOS Y SECRETOS

No modificar ni versionar secretos.

`frontend/js/config.js` puede existir localmente y estar ignorado por
Git.

Si necesitas configuración: - utilizar plantilla `config.example.js` o
equivalente sin credenciales reales; - no reemplazar el `config.js`
local real; - no imprimir secretos en logs.

Antes de realizar cambios, revisar `.gitignore`.

------------------------------------------------------------------------

# 35. GIT Y CONTROL DE CAMBIOS

Trabajar idealmente en rama:

`frontend-rebuild`

Antes de comenzar debe existir commit estable del backend.

Hacer commits lógicos por etapa, no uno gigantesco.

Ejemplos: - `feat: estructura base y autenticación` -
`feat: dashboard y navegación de animales` -
`feat: gestión integral de animales` - etc.

No reescribir historial ni hacer operaciones destructivas sin
autorización.

------------------------------------------------------------------------

# 36. ESTRATEGIA DE IMPLEMENTACIÓN RECOMENDADA

Etapa 0 --- Auditoría y plan, sin código.\
Etapa 1 --- Shell, navegación, sesión y autenticación.\
Etapa 2 --- Dashboard.\
Etapa 3 --- Animales: listado, tarjetas, registro, foto,
ficha/resumen/historial.\
Etapa 4 --- Salud y hogares.\
Etapa 5 --- Adopciones, adoptantes, seguimiento y devolución.\
Etapa 6 --- Gastos y asignaciones.\
Etapa 7 --- Archivos/Drive y difusión.\
Etapa 8 --- Esterilización: proyectos, nómina, profesionales, PDF y
documentación.\
Etapa 9 --- Documentos transversales.\
Etapa 10 --- Informes.\
Etapa 11 --- Configuración/usuarios/catálogos.\
Etapa 12 --- Responsive, accesibilidad y consistencia visual.\
Etapa 13 --- Pruebas integrales y correcciones.

No saltar directamente a Etapa 13 declarando todo terminado.

------------------------------------------------------------------------

# 37. CRITERIO DE "TERMINADO"

Una pantalla no está terminada porque renderiza.

Para considerar una funcionalidad terminada debe:

1.  mostrar correctamente datos reales;
2.  usar el contrato correcto del backend;
3.  guardar correctamente;
4.  evitar duplicados por doble clic;
5.  mostrar loading;
6.  manejar errores;
7.  refrescar estado;
8.  respetar reglas de negocio;
9.  funcionar en navegación normal;
10. conservar consistencia visual;
11. tener estado vacío;
12. haber sido probada al menos en camino exitoso y error relevante.

------------------------------------------------------------------------

# 38. MATRIZ DE TRAZABILIDAD OBLIGATORIA

Mantén durante el desarrollo una tabla:

  -----------------------------------------------------------------------------------
  ID          Requerimiento/función   Pantalla    Backend     Estado      Prueba
                                                  utilizado               
  ----------- ----------------------- ----------- ----------- ----------- -----------

  -----------------------------------------------------------------------------------

No marcar `Completado` si falta integración real.

------------------------------------------------------------------------

# 39. RIESGOS CONOCIDOS QUE DEBES VIGILAR

1.  Firma completa de `registrar_animal`.
2.  No perder valores por deshabilitar formularios antes de FormData.
3.  PK real de `TIPO_ATENCION_SANITARIA`.
4.  `medio_contacto` exacto en seguimiento.
5.  igualdad permitida en asignación total de gastos.
6.  operaciones de gasto multi-paso pueden no ser transaccionales.
7.  respuesta real de `obtener-link-archivo`.
8.  Edge Functions deben recibir multipart/JSON exactamente según
    implementación.
9.  PDF de esterilización: falta reforzar exclusividad/formato
    server-side.
10. múltiples profesionales por esterilización.
11. tarjetas deben enlazar eventos después de cada render.
12. filtros provenientes del Dashboard deben quedar visibles.
13. `animal.activo` no significa "actualmente bajo cuidado".
14. Adoptado no debe desactivar físicamente el animal.
15. catálogo genérico no debe asumir columnas homogéneas.
16. no duplicar email de Auth.
17. Drive puede fallar sin invalidar el registro principal cuando la
    regla así lo define.
18. archivos privados requieren flujo correcto para obtener enlace.
19. versiones experimentales del frontend pueden contener regresiones:
    no copiarlas ciegamente.

------------------------------------------------------------------------

# 40. DECISIONES FINAS DE INTERFAZ

-   La navegación principal usa nombres simples, no nombres técnicos de
    tablas.
-   "Salud" vive dentro de la ficha del animal.
-   "Difusión" vive dentro de la ficha.
-   "Historial" debe abrir y funcionar; nunca redirigir al Dashboard.
-   Las cards de animales son clickeables completas.
-   Las cards KPI del Dashboard son clickeables completas.
-   Las cards de selección de Informes quedan visualmente seleccionadas.
-   Las secciones de Configuración quedan visualmente seleccionadas.
-   Vista Tarjetas/Lista conserva estado durante la sesión de pantalla
    si es sencillo.
-   Usar breadcrumbs o botón Volver cuando se entra a detalles
    profundos.
-   No mostrar IDs técnicos salvo que sean útiles.
-   No mostrar rutas de Storage ni IDs Drive al usuario.
-   El código de esterilización sí es información funcional y se
    muestra.
-   Microchip se muestra cuando existe.
-   Los badges de estado deben ser consistentes en toda la aplicación.
-   El rosa/fucsia se usa como acento, no como color semántico de error.
-   Los estados vacíos deben invitar a la siguiente acción lógica.
-   Los filtros deben poder limpiarse fácilmente.
-   Después de aplicar un filtro desde Dashboard, el usuario debe
    entender por qué ve ese subconjunto.
-   No ocultar silenciosamente errores de carga de catálogos.
-   Si una operación parcial ya creó un registro, el mensaje de error
    debe decirlo para evitar duplicados.

------------------------------------------------------------------------

# 41. RESULTADO ESPERADO DE TU PRIMERA RESPUESTA

Después de leer los archivos, **NO programes**.

Responde con:

### A. Comprensión del sistema

Resumen breve de arquitectura, módulos y principio de trazabilidad.

### B. Contrato backend detectado

Lista de RPC, Edge Functions, Storage y tablas principales realmente
encontradas.

### C. Inconsistencias

Cualquier diferencia entre Ficha Maestra, este prompt y código real.

### D. Plan de reconstrucción

Etapas concretas, archivos/estructura prevista y dependencias.

### E. Matriz inicial

`Funcionalidad → backend que utilizarás`.

### F. Preguntas bloqueantes

Solo preguntas cuya respuesta sea realmente necesaria antes de
programar.

No hagas preguntas sobre decisiones que ya estén definidas en este
documento.

Finaliza esperando autorización explícita para comenzar la Etapa 1.

------------------------------------------------------------------------

# 42. PRINCIPIO FINAL

Este sistema no debe ser solamente una interfaz bonita conectada a
Supabase.

Debe ser una representación fiel del proceso validado con la Fundación,
respetar la trazabilidad histórica y utilizar correctamente la lógica ya
implementada en el backend.

Ante una duda:

**primero inspecciona → luego explica → después propone → y solo
modifica cuando corresponda.**
