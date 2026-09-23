# PLAN DE PRUEBAS DE ACEPTACIÓN

## Sistema Web de Gestión de Rescate y Adopción Animal --- Fundación Amor de Cuatro Patas

**Versión:** 1.0 --- 23 de septiembre de 2026\
**Base documental:** Ficha Maestra v7 + PROMPT_MAESTRO_FRONTEND.md +
backend v1.1 real\
**Propósito:** Validar funcional e integralmente el frontend
reconstruido antes de considerarlo terminado o presentarlo a la
Fundación.

------------------------------------------------------------------------

# 1. OBJETIVO

Este plan establece las pruebas mínimas de aceptación que debe superar
el frontend del MVP.

No basta con comprobar que una pantalla se visualiza. Cada flujo debe
verificar:

-   interfaz;
-   navegación;
-   integración real;
-   persistencia;
-   reglas de negocio;
-   trazabilidad;
-   manejo de errores;
-   prevención de duplicados;
-   actualización visual posterior;
-   seguridad básica;
-   funcionamiento responsive cuando corresponda.

El resultado esperado debe contrastarse siempre con el **backend v1.1
real**. Si una prueba falla por una diferencia entre frontend y backend,
no se modificará el backend automáticamente: primero se diagnosticará la
causa.

------------------------------------------------------------------------

# 2. ESTADOS DE PRUEBA

Cada caso tendrá uno de estos estados:

-   ⬜ **No ejecutada**
-   🟡 **En prueba**
-   🟢 **Aprobada**
-   🔴 **Fallida**
-   🟠 **Aprobada con observación**
-   ⏸️ **Bloqueada**

Una prueba solo puede marcarse como aprobada cuando el resultado se haya
comprobado realmente.

------------------------------------------------------------------------

# 3. REGISTRO DE EVIDENCIA

Para cada prueba registrar:

  Campo                   Contenido
  ----------------------- ------------------------------------------
  ID                      Identificador del caso
  Fecha                   Fecha de ejecución
  Ejecutora               Persona que realiza la prueba
  Navegador/dispositivo   Entorno utilizado
  Datos utilizados        Datos ficticios relevantes
  Resultado               Aprobada/Fallida/etc.
  Evidencia               Captura, mensaje, registro o descripción
  Incidencia              Descripción si falla
  Observaciones           Información adicional

No utilizar información personal real durante pruebas técnicas si no es
necesario.

------------------------------------------------------------------------

# 4. DATOS DE PRUEBA RECOMENDADOS

Crear datos ficticios claramente identificables y eliminarlos/limpiarlos
de manera controlada cuando corresponda.

Ejemplos:

-   Animal: `Luna Prueba`
-   Microchip válido: un código ficticio de exactamente 15 dígitos que
    no corresponda a un animal real.
-   Hogar: `Hogar Prueba QA`
-   Adoptante: datos ficticios válidos.
-   Proyecto: `Proyecto Esterilización QA`
-   Profesional: `Veterinario Prueba QA`
-   Gastos: montos simples que permitan verificar sumas.

**No inventar microchips que puedan confundirse con información real en
producción. Si se prueba sobre un entorno compartido, identificar
claramente los registros como prueba.**

------------------------------------------------------------------------

# 5. AUTENTICACIÓN Y SESIÓN

## PA-AUT-01 --- Inicio de sesión correcto

**Precondición:** usuario autorizado y activo.

**Pasos:** 1. Abrir Login. 2. Ingresar correo y contraseña válidos. 3.
Presionar `Ingresar`.

**Resultado esperado:** - se autentica mediante Supabase Auth; - se abre
Panel principal; - se muestra sesión/nombre de usuaria; - no aparecen
errores; - no se utiliza autenticación local.

**Integración:** Supabase Auth.

------------------------------------------------------------------------

## PA-AUT-02 --- Credenciales incorrectas

1.  Ingresar credenciales inválidas.
2.  Presionar `Ingresar`.

**Esperado:** - no se inicia sesión; - mensaje comprensible; - no se
muestran datos internos; - botón vuelve a quedar disponible.

------------------------------------------------------------------------

## PA-AUT-03 --- Prevención de doble login

1.  Ingresar credenciales válidas.
2.  hacer doble clic rápido en `Ingresar`.

**Esperado:** - una sola operación efectiva; - botón muestra estado de
carga; - no se producen errores por solicitudes duplicadas.

------------------------------------------------------------------------

## PA-AUT-04 --- Cierre de sesión

1.  Con sesión activa, seleccionar `Cerrar sesión`.

**Esperado:** - sesión finaliza; - vuelve a Login; - rutas/pantallas
internas dejan de ser accesibles sin autenticación.

------------------------------------------------------------------------

## PA-AUT-05 --- Usuario interno inactivo

**Precondición:** cuenta de prueba desactivada mediante flujo
autorizado.

**Esperado:** - el usuario no puede operar normalmente el sistema; -
RLS/autorización se respeta; - no se abre acceso modificando únicamente
el frontend.

------------------------------------------------------------------------

# 6. NAVEGACIÓN GENERAL

## PA-NAV-01 --- Menú principal

Verificar acceso a:

-   Panel principal
-   Animales
-   Hogares temporales
-   Adopciones
-   Gastos
-   Proyectos de esterilización
-   Documentos
-   Informes
-   Configuración

**Esperado:** cada opción abre su módulo y queda visualmente activa.

------------------------------------------------------------------------

## PA-NAV-02 --- Navegación responsive

Probar escritorio, ancho tablet y ancho móvil.

**Esperado:** - menú usable; - contenido no queda inaccesible; -
formularios no se cortan; - acciones importantes permanecen disponibles.

------------------------------------------------------------------------

## PA-NAV-03 --- Navegación profunda

Entrar a: `Animales → Ficha → Salud`, luego volver.

**Esperado:** no se redirige accidentalmente al Dashboard y el flujo
conserva contexto razonablemente.

------------------------------------------------------------------------

# 7. DASHBOARD

## PA-DAS-01 --- KPI correctos

**Esperado:** aparecen exactamente:

1.  Animales activos
2.  En tratamiento
3.  En hogar temporal
4.  Adoptados
5.  Rescatados este mes

No aparece `Disponible para adopción` como KPI.

------------------------------------------------------------------------

## PA-DAS-02 --- Cálculo Animales activos

Preparar al menos: - un Rescatado; - un En tratamiento; - un En hogar
temporal; - un Adoptado.

**Esperado:** Animales activos incluye los tres primeros y excluye
Adoptado, sin cambiar `ANIMAL.activo` por la adopción.

------------------------------------------------------------------------

## PA-DAS-03 --- KPI clickeables

Hacer clic en cada KPI.

**Esperado:** - navega a Animales; - aplica filtro correcto; - el filtro
queda visible en la interfaz.

------------------------------------------------------------------------

## PA-DAS-04 --- Rescatados este mes

Crear/verificar animales con fecha de rescate: - mes actual; - mes
anterior.

**Esperado:** KPI cuenta solamente fecha_rescate del mes actual.

------------------------------------------------------------------------

# 8. LISTADO DE ANIMALES

## PA-ANI-01 --- Carga inicial

Abrir Animales.

**Esperado:** - datos cargan; - tarjetas son clickeables desde el primer
render; - no es necesario cambiar a Lista para habilitar eventos.

------------------------------------------------------------------------

## PA-ANI-02 --- Tarjeta abre ficha

Clic en cualquier zona no interactiva de una tarjeta.

**Esperado:** abre la ficha correcta.

------------------------------------------------------------------------

## PA-ANI-03 --- Vista Lista

Cambiar Tarjetas → Lista.

**Esperado:** - mismos animales; - columnas relevantes; - fila/Ver ficha
abre animal correcto; - control visual indica `Lista`.

------------------------------------------------------------------------

## PA-ANI-04 --- Volver a Tarjetas

Cambiar Lista → Tarjetas.

**Esperado:** tarjetas siguen siendo clickeables.

------------------------------------------------------------------------

## PA-ANI-05 --- Búsqueda por nombre

Buscar animal conocido.

**Esperado:** resultados correctos.

------------------------------------------------------------------------

## PA-ANI-06 --- Búsqueda por microchip

Buscar microchip existente.

**Esperado:** animal correcto.

------------------------------------------------------------------------

## PA-ANI-07 --- Filtro estado

Seleccionar cada estado disponible.

**Esperado:** solo registros correspondientes.

------------------------------------------------------------------------

## PA-ANI-08 --- Sin resultados

Aplicar filtro que no tenga coincidencias.

**Esperado:** estado vacío de "sin resultados", no error ni pantalla en
blanco.

------------------------------------------------------------------------

# 9. REGISTRO DE ANIMAL

## PA-REG-01 --- Registro mínimo válido

Completar campos obligatorios sin foto.

**Esperado:** - RPC `registrar_animal` recibe firma completa; - animal
creado; - estado inicial Rescatado; - primer HISTORIAL_ESTADO creado; -
no se seleccionó estado manualmente.

------------------------------------------------------------------------

## PA-REG-02 --- Registro con datos completos

Completar todos los campos válidos.

**Esperado:** todos persisten correctamente.

------------------------------------------------------------------------

## PA-REG-03 --- Microchip válido

Ingresar exactamente 15 dígitos.

**Esperado:** acepta y persiste.

------------------------------------------------------------------------

## PA-REG-04 --- Microchip inválido

Probar menos/más de 15 dígitos o caracteres no numéricos.

**Esperado:** rechazo claro; no crea registro inconsistente.

------------------------------------------------------------------------

## PA-REG-05 --- Microchip duplicado

Intentar registrar otro animal con microchip ya existente.

**Esperado:** backend rechaza duplicidad y UI explica el problema.

------------------------------------------------------------------------

## PA-REG-06 --- Fotografía principal

Registrar animal con JPG/PNG válido.

**Esperado:** - imagen optimizada/convertida a WebP; - Storage path
`animales/{id}/principal.webp`; - path persistido; - foto visible en
listado/ficha; - no se almacena binario en PostgreSQL.

------------------------------------------------------------------------

## PA-REG-07 --- Doble clic

Presionar Registrar repetidamente.

**Esperado:** un único animal creado.

------------------------------------------------------------------------

## PA-REG-08 --- Drive falla después de crear animal

Simular/probar fallo controlado si es posible.

**Esperado:** - animal permanece creado; - mensaje distingue éxito
principal de fallo Drive; - no invita a registrar el animal
nuevamente; - existe posibilidad futura de reintento.

------------------------------------------------------------------------

## PA-REG-09 --- Foto falla después de crear animal

**Esperado:** - animal permanece; - mensaje "animal registrado /
fotografía no cargada" o equivalente; - no se crea duplicado por
reintento global.

------------------------------------------------------------------------

# 10. FICHA DEL ANIMAL

## PA-FIC-01 --- Pestañas

Verificar exactamente:

Resumen · Salud · Hogares · Adopción · Gastos · Archivos · Historial ·
Difusión

**Esperado:** todas abren y la activa queda marcada.

------------------------------------------------------------------------

## PA-FIC-02 --- Editar información descriptiva

Modificar dato permitido.

**Esperado:** persiste y se refresca.

------------------------------------------------------------------------

## PA-FIC-03 --- Estado no editable genéricamente

Abrir Editar.

**Esperado:** no existe campo que permita sobrescribir estado actual
directamente.

------------------------------------------------------------------------

## PA-FIC-04 --- Historial

Abrir Historial.

**Esperado:** - muestra cambios reales; - no redirige a Dashboard; -
registros anteriores permanecen.

------------------------------------------------------------------------

# 11. ESTADOS

## PA-EST-01 --- Cambio manual válido

Usar `Cambiar estado` hacia estado permitido por RPC.

**Esperado:** - historial anterior se cierra; - nuevo historial se
abre; - estado actual sincronizado.

------------------------------------------------------------------------

## PA-EST-02 --- Estado reservado a proceso

Intentar establecer manualmente un estado que deba producirse mediante
hogar/adopción.

**Esperado:** interfaz no lo ofrece o backend lo rechaza claramente.

------------------------------------------------------------------------

# 12. SALUD

## PA-SAL-01 --- Catálogo carga correctamente

Abrir Registrar atención.

**Esperado:** tipos reales aparecen; no existe error por
`id_tipo_atencion_sanitaria`.

------------------------------------------------------------------------

## PA-SAL-02 --- Registrar atención

Completar evento válido.

**Esperado:** se guarda en ATENCION_SANITARIA y aparece en ficha.

------------------------------------------------------------------------

## PA-SAL-03 --- Atención no cambia estado automáticamente

Registrar vacunación/control a animal Rescatado.

**Esperado:** continúa Rescatado salvo cambio explícito separado.

------------------------------------------------------------------------

## PA-SAL-04 --- Próximo control inválido

Próximo control anterior a fecha de atención.

**Esperado:** rechazo.

------------------------------------------------------------------------

## PA-SAL-05 --- Próximos controles Dashboard

Crear atención con próximo control futuro próximo.

**Esperado:** aparece en bloque correspondiente si Dashboard lo
implementa.

------------------------------------------------------------------------

# 13. HOGARES TEMPORALES

## PA-HOG-01 --- Crear hogar

Registrar hogar válido.

**Esperado:** aparece en listado.

------------------------------------------------------------------------

## PA-HOG-02 --- Editar hogar

Modificar datos.

**Esperado:** persisten.

------------------------------------------------------------------------

## PA-HOG-03 --- Ocupación actual

Asignar animal.

**Esperado:** contador actual aumenta; no se muestra capacidad máxima.

------------------------------------------------------------------------

## PA-HOG-04 --- Ingresar animal

Desde ficha o módulo usar flujo de ingreso.

**Esperado:** - RPC `ingresar_hogar_temporal`; - permanencia activa; -
estado En hogar temporal; - historial de estado consistente.

------------------------------------------------------------------------

## PA-HOG-05 --- Doble hogar activo

Intentar asignar el mismo animal a otro hogar sin cambio controlado.

**Esperado:** no quedan dos permanencias activas.

------------------------------------------------------------------------

## PA-HOG-06 --- Cambiar hogar

Usar `Cambiar de hogar`.

**Esperado:** - permanencia anterior cerrada; - nueva abierta; -
anterior no desaparece; - no se crea cambio artificial de estado si
continúa En hogar temporal.

------------------------------------------------------------------------

## PA-HOG-07 --- Finalizar hogar

Finalizar permanencia y seleccionar nueva situación válida.

**Esperado:** fecha salida + nuevo estado coherentes.

------------------------------------------------------------------------

## PA-HOG-08 --- Indicador visual disponible

Animal En hogar temporal.

**Esperado:** puede mostrar indicador visual `Disponible para adopción`,
pero backend continúa con estado único En hogar temporal.

------------------------------------------------------------------------

# 14. ADOPTANTES Y ADOPCIONES

## PA-ADO-01 --- Crear adoptante

Registrar datos ficticios válidos.

**Esperado:** aparece y RUT respeta reglas.

------------------------------------------------------------------------

## PA-ADO-02 --- RUT duplicado

Intentar duplicar adoptante con mismo RUT normalizado.

**Esperado:** rechazo/control adecuado.

------------------------------------------------------------------------

## PA-ADO-03 --- Registrar adopción

Adoptar animal elegible.

**Esperado:** - RPC `registrar_adopcion`; - adopción activa; - animal
Adoptado; - hogar activo se cierra si existía; - historia permanece.

------------------------------------------------------------------------

## PA-ADO-04 --- Doble adopción abierta

Intentar segunda adopción abierta del mismo animal.

**Esperado:** se impide.

------------------------------------------------------------------------

## PA-ADO-05 --- Acceso desde dos puntos

Probar registrar adopción: - ficha animal; - módulo Adopciones.

**Esperado:** ambos utilizan mismo proceso/backend.

------------------------------------------------------------------------

# 15. SEGUIMIENTOS Y DEVOLUCIÓN

## PA-SEG-01 --- WhatsApp

Registrar seguimiento con WhatsApp.

**Esperado:** persiste.

------------------------------------------------------------------------

## PA-SEG-02 --- Teléfono

UI puede mostrar `Teléfono`, pero valor enviado debe ser `Telefono`.

**Esperado:** persiste sin CHECK error.

------------------------------------------------------------------------

## PA-SEG-03 --- Correo

UI puede mostrar `Correo`, valor backend `Correo`.

**Esperado:** persiste.

------------------------------------------------------------------------

## PA-SEG-04 --- Fecha inválida

Fecha anterior a adopción.

**Esperado:** rechazo.

------------------------------------------------------------------------

## PA-SEG-05 --- Historial de seguimientos

Crear dos seguimientos.

**Esperado:** ambos visibles; segundo no sobrescribe primero.

------------------------------------------------------------------------

## PA-DEV-01 --- Registrar devolución

**Esperado:** - adopción pasa a Devuelto; - antecedente permanece; -
animal adquiere nueva situación; - puede posteriormente iniciar otra
adopción.

------------------------------------------------------------------------

# 16. GASTOS

## PA-GAS-01 --- Gasto general

Crear gasto sin asignaciones.

**Esperado:** persiste como gasto general.

------------------------------------------------------------------------

## PA-GAS-02 --- Gasto totalmente asignado a un animal

Total: 10.000\
Asignación: 10.000

**Esperado:** válido. No rechazar igualdad.

------------------------------------------------------------------------

## PA-GAS-03 --- Gasto parcialmente asignado

Total: 10.000\
Asignación: 3.000

**Esperado:** válido; restante general 7.000.

------------------------------------------------------------------------

## PA-GAS-04 --- Gasto compartido

Total: 10.000\
Animal A: 4.000\
Animal B: 6.000

**Esperado:** válido; suma asignada 10.000.

------------------------------------------------------------------------

## PA-GAS-05 --- Exceso

Total: 10.000\
Asignaciones: 10.001

**Esperado:** rechazo; RN-57.

------------------------------------------------------------------------

## PA-GAS-06 --- Indicador de suma

Mientras se asigna: - mostrar total; - asignado; - restante.

**Esperado:** cálculos visuales correctos.

------------------------------------------------------------------------

## PA-GAS-07 --- Doble asignación mismo animal/gasto

**Esperado:** no se duplica relación.

------------------------------------------------------------------------

## PA-GAS-08 --- Error en segunda asignación

Si gasto ya fue creado y una asignación posterior falla:

**Esperado:** UI informa claramente estado parcial; no asegura rollback
si backend no lo proporciona.

------------------------------------------------------------------------

# 17. ARCHIVOS Y GOOGLE DRIVE

## PA-ARC-01 --- Subir archivo animal

Seleccionar archivo válido y categoría.

**Esperado:** - archivo llega a Edge Function completo; - se sube a
Drive; - ARCHIVO se registra; - asociación ANIMAL_ARCHIVO existe.

------------------------------------------------------------------------

## PA-ARC-02 --- Prevención doble upload

Doble clic en Subir.

**Esperado:** un archivo/registro.

------------------------------------------------------------------------

## PA-ARC-03 --- Abrir archivo

Clic `Abrir en Drive`.

**Esperado:** - llama `obtener-link-archivo` con id_archivo; - procesa
estructura real de respuesta; - abre visor nativo Drive en nueva
pestaña.

------------------------------------------------------------------------

## PA-ARC-04 --- Privacidad

**Esperado:** frontend no convierte el archivo a "cualquiera con
enlace".

------------------------------------------------------------------------

## PA-ARC-05 --- Error Edge Function

Provocar entrada inválida.

**Esperado:** UI intenta mostrar detalle útil del error, no solo mensaje
genérico non-2xx.

------------------------------------------------------------------------

# 18. DIFUSIÓN

## PA-DIF-01 --- Texto base

Abrir Difusión.

**Esperado:** genera texto con datos autorizados del animal.

------------------------------------------------------------------------

## PA-DIF-02 --- Prompt

**Esperado:** prompt estructurado, editable y copiable.

------------------------------------------------------------------------

## PA-DIF-03 --- Edición

Modificar texto generado.

**Esperado:** usuario puede editar antes de copiar.

------------------------------------------------------------------------

## PA-DIF-04 --- Privacidad

**Esperado:** no incluye RUT/direcciones/teléfonos privados de
adoptantes.

------------------------------------------------------------------------

## PA-DIF-05 --- Sin API IA

**Esperado:** no se realizan solicitudes a servicio IA externo.

------------------------------------------------------------------------

# 19. PROYECTOS DE ESTERILIZACIÓN

## PA-PRO-01 --- Crear proyecto

Completar datos reales.

**Esperado:** proyecto creado sin meta/cupo y sin URL Drive manual.

------------------------------------------------------------------------

## PA-PRO-02 --- Estructura Drive

Después de crear proyecto.

**Esperado:** - carpeta principal; - `Documentación`; - `Animales`; - id
carpeta principal guardado.

------------------------------------------------------------------------

## PA-PRO-03 --- Fallo Drive

**Esperado:** proyecto permanece creado y se informa fallo secundario.

------------------------------------------------------------------------

## PA-PRO-04 --- Pestañas

Detalle proyecto muestra exactamente:

Información · Nómina · Profesionales · Documentación

------------------------------------------------------------------------

# 20. NÓMINA DE ESTERILIZACIÓN

## PA-NOM-01 --- Agregar animal

Registrar animal con código y datos válidos.

**Esperado:** aparece en nómina y queda relacionado al proyecto.

------------------------------------------------------------------------

## PA-NOM-02 --- Código duplicado mismo proyecto

**Esperado:** rechazo.

------------------------------------------------------------------------

## PA-NOM-03 --- Mismo código en otro proyecto

Si backend lo permite por unicidad compuesta:

**Esperado:** válido.

------------------------------------------------------------------------

## PA-NOM-04 --- Microchip válido

15 dígitos.

**Esperado:** acepta.

------------------------------------------------------------------------

## PA-NOM-05 --- Microchip duplicado dentro del proyecto

**Esperado:** rechazo.

------------------------------------------------------------------------

## PA-NOM-06 --- Mismo microchip en otro proyecto

**Esperado:** permitido si backend real mantiene unicidad solo por
proyecto.

------------------------------------------------------------------------

## PA-NOM-07 --- Código y microchip diferenciados

**Esperado:** UI muestra ambos como conceptos distintos.

------------------------------------------------------------------------

# 21. PROFESIONALES EN ESTERILIZACIÓN

## PA-PRF-01 --- Crear profesional

**Esperado:** profesional reutilizable.

------------------------------------------------------------------------

## PA-PRF-02 --- Asociar profesional al agregar animal

**Esperado:** relación ESTERILIZACION_PROFESIONAL creada con función.

------------------------------------------------------------------------

## PA-PRF-03 --- Múltiples profesionales

Asociar dos profesionales al mismo animal.

**Esperado:** ambas relaciones persisten.

------------------------------------------------------------------------

## PA-PRF-04 --- Profesional en múltiples proyectos

Usar profesional existente en otro proyecto.

**Esperado:** no se duplica innecesariamente el profesional; nueva
relación válida.

------------------------------------------------------------------------

## PA-PRF-05 --- Pestaña Profesionales

**Esperado:** lista profesionales del proyecto derivados a través de las
esterilizaciones, no de una FK directa inexistente.

------------------------------------------------------------------------

# 22. PDF DE ESTERILIZACIÓN

## PA-PDF-01 --- PDF obligatorio en flujo definido

Seleccionar PDF válido al agregar animal.

**Esperado:** frontend reconoce el archivo seleccionado incluso después
de activar loading.

------------------------------------------------------------------------

## PA-PDF-02 --- Tipo incorrecto

Seleccionar archivo no PDF.

**Esperado:** frontend rechaza.

**Observación:** registrar si backend también lo rechaza; actualmente
puede ser un control pendiente server-side.

------------------------------------------------------------------------

## PA-PDF-03 --- Ubicación

**Esperado:** `Proyecto/Animales/{codigo}.pdf`

No carpeta individual.

------------------------------------------------------------------------

## PA-PDF-04 --- Asociación

**Esperado:** ARCHIVO + ESTERILIZACION_ARCHIVO.

------------------------------------------------------------------------

## PA-PDF-05 --- Abrir desde nómina

Clic `Abrir PDF`.

**Esperado:** abre documento correcto mediante flujo seguro.

------------------------------------------------------------------------

## PA-PDF-06 --- Ficha previa/reemplazo

Si ya existe documento: - verificar comportamiento implementado.

**Resultado deseado:** `Abrir | Reemplazar`, sin duplicados
accidentales.

**Estado inicial:** puede quedar bloqueada/observada hasta reforzar
backend si todavía no existe garantía server-side.

------------------------------------------------------------------------

# 23. DOCUMENTACIÓN DEL PROYECTO

## PA-DOC-01 --- Subir documento general

**Esperado:** va a subcarpeta `Documentación`, no `Animales`.

------------------------------------------------------------------------

## PA-DOC-02 --- Abrir documento

**Esperado:** abre archivo correcto en Drive.

------------------------------------------------------------------------

# 24. MÓDULO DOCUMENTOS

## PA-DOC-03 --- Búsqueda transversal

Buscar archivo por nombre/categoría.

**Esperado:** encuentra archivos de diferentes contextos.

------------------------------------------------------------------------

## PA-DOC-04 --- Filtros de contexto

**Esperado:** filtra correctamente sin cambiar asociación real.

------------------------------------------------------------------------

## PA-DOC-05 --- No mostrar datos técnicos innecesarios

**Esperado:** no muestra `id_externo`/ruta interna como información
principal.

------------------------------------------------------------------------

# 25. INFORMES

## PA-INF-01 --- Selección visual

Clic en un tipo de informe.

**Esperado:** tarjeta permanece visualmente seleccionada.

------------------------------------------------------------------------

## PA-INF-02 --- Cambio de informe

Seleccionar otro.

**Esperado:** selección anterior se desmarca y filtros cambian.

------------------------------------------------------------------------

## PA-INF-03 --- Sin título redundante

**Esperado:** no se necesita repetir "Informe seleccionado: ..." debajo
si la tarjeta ya lo comunica.

------------------------------------------------------------------------

## PA-INF-04 --- Filtros contextuales

Seleccionar Gastos.

**Esperado:** aparecen filtros pertinentes a gastos; no campos
irrelevantes de esterilización.

------------------------------------------------------------------------

## PA-INF-05 --- Rango de fechas

Aplicar fecha desde/hasta.

**Esperado:** resultados respetan rango.

------------------------------------------------------------------------

## PA-INF-06 --- Combinación de filtros

Combinar dos o más filtros.

**Esperado:** consulta respeta todos.

------------------------------------------------------------------------

## PA-INF-07 --- Limpiar filtros

**Esperado:** controles y resultados vuelven al estado correspondiente.

------------------------------------------------------------------------

## PA-INF-08 --- Sin resultados

**Esperado:** mensaje claro, no error.

------------------------------------------------------------------------

## PA-INF-09 --- Exportación

Si Excel/CSV está implementado:

**Esperado:** archivo contiene resultados filtrados, encabezados
comprensibles y no expone campos técnicos innecesarios.

------------------------------------------------------------------------

# 26. CONFIGURACIÓN

## PA-CON-01 --- Mi cuenta

**Esperado:** nombre interno + email proveniente de Auth; email no se
duplica artificialmente en public.usuario.

------------------------------------------------------------------------

## PA-CON-02 --- Invitar usuario

**Esperado:** Edge Function invitar-usuario funciona y no expone service
role.

------------------------------------------------------------------------

## PA-CON-03 --- Desactivar usuario

**Esperado:** usa RPC controlada.

------------------------------------------------------------------------

## PA-CON-04 --- Autodesactivación

Intentar desactivar cuenta propia cuando la regla lo impida.

**Esperado:** rechazo.

------------------------------------------------------------------------

## PA-CON-05 --- Último usuario activo

Intentar dejar sistema sin usuarios activos.

**Esperado:** rechazo RN-59.

------------------------------------------------------------------------

# 27. CATÁLOGOS

## PA-CAT-01 --- Carga de catálogos

**Esperado:** todos cargan usando PK/campos reales.

------------------------------------------------------------------------

## PA-CAT-02 --- Tipo atención sanitaria

**Esperado:** utiliza `id_tipo_atencion`.

------------------------------------------------------------------------

## PA-CAT-03 --- Estado

**Esperado:** utiliza `nombre_estado`, no asume `nombre`.

------------------------------------------------------------------------

## PA-CAT-04 --- Rango etario

**Esperado:** formulario contempla edades mínimas/máximas y no lo trata
como catálogo simple si no corresponde.

------------------------------------------------------------------------

## PA-CAT-05 --- Activar/desactivar

Si backend/RLS lo permite:

**Esperado:** cambia `activo`; no elimina registro.

------------------------------------------------------------------------

# 28. DOBLE SUBMIT --- AUDITORÍA TRANSVERSAL

Ejecutar doble clic rápido en acciones creadoras principales:

-   registrar animal;
-   atención sanitaria;
-   hogar;
-   ingreso a hogar;
-   adopción;
-   seguimiento;
-   gasto;
-   archivo;
-   proyecto;
-   animal de esterilización;
-   profesional;
-   invitación de usuario.

**Esperado general:** una sola operación efectiva.

Buscar en código patrones peligrosos donde `setFormBusy` o equivalente
deshabilite controles antes de `FormData`.

------------------------------------------------------------------------

# 29. ERRORES Y RECUPERACIÓN

## PA-ERR-01 --- Pérdida de red

Durante operación no destructiva, simular fallo.

**Esperado:** mensaje, formulario recuperable, sin duplicación
automática.

------------------------------------------------------------------------

## PA-ERR-02 --- Error backend de validación

Enviar dato que backend rechace.

**Esperado:** mensaje entendible y sin alterar otros datos
indebidamente.

------------------------------------------------------------------------

## PA-ERR-03 --- Operación parcialmente exitosa

Ejemplo animal creado + foto fallida.

**Esperado:** UI diferencia ambas etapas.

------------------------------------------------------------------------

# 30. SEGURIDAD

## PA-SEGUR-01 --- Sin service role en frontend

Inspeccionar archivos.

**Esperado:** no existe service role key.

------------------------------------------------------------------------

## PA-SEGUR-02 --- Sin secretos Google

**Esperado:** no aparecen client secret, refresh token ni credenciales
OAuth.

------------------------------------------------------------------------

## PA-SEGUR-03 --- config.js

**Esperado:** configuración real local no está versionada si contiene
datos que deban permanecer locales; existe alternativa de ejemplo cuando
corresponda.

------------------------------------------------------------------------

## PA-SEGUR-04 --- Acceso no autenticado

Intentar abrir/consultar datos sin sesión.

**Esperado:** RLS impide acceso.

------------------------------------------------------------------------

## PA-SEGUR-05 --- Auditoría RPC

Revisar privilegios de ejecución.

**Esperado:** funciones de negocio sensibles no deben quedar ejecutables
por `anon` salvo decisión explícita y justificada.

Si se detecta diferencia, registrar incidencia; no modificar
silenciosamente.

------------------------------------------------------------------------

# 31. TRAZABILIDAD HISTÓRICA

## PA-TRA-01 --- Cambio de estado

**Esperado:** estado anterior permanece en historial.

## PA-TRA-02 --- Cambio de hogar

**Esperado:** hogar anterior permanece.

## PA-TRA-03 --- Devolución

**Esperado:** adopción anterior permanece.

## PA-TRA-04 --- Nueva adopción posterior

**Esperado:** adopción anterior y nueva pueden reconstruirse
históricamente.

## PA-TRA-05 --- Proyecto finalizado

**Esperado:** proyecto, animales, profesionales y archivos permanecen.

------------------------------------------------------------------------

# 32. EXPERIENCIA VISUAL

## PA-UX-01 --- Consistencia de colores

**Esperado:** azul estructura, fucsia acento, semánticos coherentes.

## PA-UX-02 --- Botones

**Esperado:** jerarquía clara; no todos compiten visualmente.

## PA-UX-03 --- Loading

**Esperado:** acciones asíncronas muestran progreso.

## PA-UX-04 --- Estados vacíos

Verificar Animales, Gastos, Documentos, etc.

**Esperado:** diferencia entre sin datos, sin resultados y error.

## PA-UX-05 --- Badges

**Esperado:** mismo estado usa misma presentación en todos los módulos.

## PA-UX-06 --- Datos técnicos

**Esperado:** IDs, paths y referencias internas no se muestran salvo
utilidad funcional.

------------------------------------------------------------------------

# 33. RESPONSIVE Y ACCESIBILIDAD

## PA-RES-01 --- Escritorio

Probar resolución habitual.

**Esperado:** layout estable.

## PA-RES-02 --- Tablet

**Esperado:** navegación y formularios utilizables.

## PA-RES-03 --- Móvil

**Esperado:** sidebar accesible, cards una columna, acciones visibles.

## PA-ACC-01 --- Teclado

**Esperado:** cards clickeables importantes pueden activarse sin mouse.

## PA-ACC-02 --- Labels

**Esperado:** campos tienen etiquetas claras.

## PA-ACC-03 --- Foco

**Esperado:** foco visible.

------------------------------------------------------------------------

# 34. PRUEBA INTEGRAL DE PUNTA A PUNTA

## PA-E2E-01 --- Ciclo completo de rescate

Ejecutar en orden:

1.  iniciar sesión;
2.  registrar animal con foto;
3.  verificar Rescatado + historial;
4.  registrar atención sanitaria;
5.  cambiar estado cuando corresponda;
6.  ingresar a hogar temporal;
7.  cambiar hogar;
8.  registrar gasto asociado;
9.  subir documento;
10. registrar adoptante;
11. registrar adopción;
12. registrar seguimiento;
13. registrar devolución;
14. comprobar historial completo.

**Esperado:** ningún antecedente histórico desaparece y todas las
relaciones permanecen coherentes.

------------------------------------------------------------------------

## PA-E2E-02 --- Proyecto de esterilización completo

1.  crear proyecto;
2.  comprobar estructura Drive;
3.  crear/seleccionar profesional;
4.  agregar animal a nómina;
5.  asociar profesional;
6.  adjuntar PDF;
7.  abrir PDF desde nómina;
8.  subir documento general de proyecto;
9.  verificar pestaña Profesionales;
10. generar/consultar informe relacionado si existe;
11. finalizar proyecto cuando corresponda.

**Esperado:** trazabilidad completa sin incorporar automáticamente esos
animales al módulo de rescate.

------------------------------------------------------------------------

# 35. REGRESIONES ESPECÍFICAS QUE NO DEBEN REAPARECER

Estas pruebas son obligatorias porque ya se observaron fallos en
versiones experimentales:

  -----------------------------------------------------------------------
  ID                      Regresión               Resultado obligatorio
  ----------------------- ----------------------- -----------------------
  REG-01                  Tarjetas animales no    Deben abrir ficha
                          clickeables al primer   inmediatamente
                          render                  

  REG-02                  KPI Dashboard sin       Todos los KPI definidos
                          navegación              deben navegar

  REG-03                  `registrar_animal`      Debe enviarse firma
                          enviado solo con dos    real completa
                          parámetros              

  REG-04                  FormData vacío por      Capturar antes de
                          inputs disabled         bloquear

  REG-05                  Gasto igual al total    Igualdad debe aceptarse
                          rechazado               

  REG-06                  PDF seleccionado        Archivo debe
                          aparece como            conservarse al enviar
                          inexistente             

  REG-07                  Upload Drive recibe     Multipart completo
                          formulario incompleto   

  REG-08                  Informe seleccionado    Card permanece
                          pierde indicación       seleccionada
                          visual                  

  REG-09                  Historial redirige al   Abre historial correcto
                          Dashboard               

  REG-10                  Seguimiento usa         Enviar
                          `Teléfono`/`Email` como `Telefono`/`Correo`
                          valor backend           

  REG-11                  PK sanitaria inferida   Usar `id_tipo_atencion`
                          incorrectamente         

  REG-12                  Adoptados contados como Excluir estado Adoptado
                          animales activos        
                          operativos              

  REG-13                  Reintento tras fallo    Mantener ID creado y
                          secundario crea animal  comunicar fallo parcial
                          duplicado               
  -----------------------------------------------------------------------

------------------------------------------------------------------------

# 36. CRITERIOS PARA ACEPTAR EL FRONTEND COMPLETO

El frontend puede declararse **candidato a validación con la Fundación**
únicamente cuando:

-   no existen casos críticos 🔴 en autenticación, animales, hogares,
    adopciones, gastos, Drive o esterilización;
-   las regresiones REG-01 a REG-13 están aprobadas;
-   los flujos E2E principales fueron ejecutados;
-   no existen secretos en frontend/repositorio;
-   no se detectaron eliminaciones físicas incompatibles con
    trazabilidad;
-   los errores conocidos pendientes están documentados;
-   las funcionalidades fuera de alcance no fueron introducidas;
-   responsive básico fue revisado;
-   la matriz requerimiento → implementación → prueba está actualizada.

Un caso pendiente no debe ocultarse para declarar el sistema terminado.

------------------------------------------------------------------------

# 37. INFORME FINAL DE PRUEBAS

Al finalizar, generar una tabla:

  -----------------------------------------------------------------------------------------
  Área               Ejecutadas    Aprobadas     Fallidas   Observadas/Bloqueadas Estado
  ---------------- ------------ ------------ ------------ ----------------------- ---------
  Autenticación                                                                   

  Dashboard                                                                       

  Animales                                                                        

  Salud                                                                           

  Hogares                                                                         

  Adopciones                                                                      

  Gastos                                                                          

  Archivos/Drive                                                                  

  Difusión                                                                        

  Esterilización                                                                  

  Documentos                                                                      

  Informes                                                                        

  Configuración                                                                   

  Seguridad                                                                       

  Responsive/UX                                                                   

  E2E                                                                             
  -----------------------------------------------------------------------------------------

Además indicar:

-   incidencias críticas pendientes;
-   incidencias menores;
-   controles backend pendientes;
-   mejoras futuras fuera del MVP;
-   recomendación técnica: `Listo para validación` o
    `Requiere correcciones`.

La recomendación técnica se refiere al **estado del software frente a
estos criterios**, no sustituye la validación funcional final de la
Fundación.

------------------------------------------------------------------------

# 38. INSTRUCCIÓN PARA CLAUDE / CLAUDE CODE

Este archivo forma parte del contrato del proyecto.

Durante la implementación:

1.  relaciona cada etapa con los casos de prueba correspondientes;
2.  no marques pruebas como aprobadas solo por inspección de código
    cuando requieran ejecución real;
3.  informa cuáles puedes verificar automáticamente y cuáles debe
    ejecutar la usuaria contra Supabase/Google Drive;
4.  al terminar una etapa, indica los IDs de prueba que deberían
    ejecutarse;
5.  no alteres los resultados esperados para adaptarlos a una
    implementación incorrecta;
6.  si el backend real contradice este plan, documenta la diferencia
    antes de modificar código;
7.  conserva las incidencias y decisiones para la revisión final.

**El objetivo no es "pasar las pruebas" artificialmente: es comprobar
que el sistema implementa correctamente el proceso diseñado y mantiene
su trazabilidad.**
