// ================= CONFIGURACIÓN Y CONEXIÓN =================
const SUPABASE_URL = 'https://yhdaskochzbqktusekbt.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloZGFza29jaHpicWt0dXNla2J0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0OTE1MDAsImV4cCI6MjA4MzA2NzUwMH0.kAHQ90Wjy3R_X81e2DZCMtSjJfXp2wlTqnBFBgtJo9M';

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

// Variables Globales
let categorias = [];
let historialPedidos = [];
let currentUser = null;
let usuarioActual = localStorage.getItem('usuarioActual') || null;
let invitadoTemp = null; 
let accionPendiente = null; 
let pedidoActualParaImprimir = null; 
let printWindow = null; 

// Instancias de Bootstrap (se inician al cargar)
let toastBootstrap, modalCategoriaInst, modalProductoInst, modalDatosInvitadoInst, modalDetallePedidoInst, modalConfirmacionInst, modalExitoOrdenInst, modalDetalleInst;

function formatearRD(monto) {
  return 'RD$ ' + monto.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// ================= INICIALIZACIÓN (DOM READY) =================
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Inicializar Modales y Toasts
  inicializarComponentesBootstrap();
  
  // 2. Verificar Sesión Guardada
  if (usuarioActual) {
    const { data, error } = await supabaseClient.from('usuarios').select('*').eq('username', usuarioActual).single();
    if (data) {
      currentUser = data;
    } else {
      localStorage.removeItem('usuarioActual');
      usuarioActual = null;
    }
  }
  
  // 3. Cargar Datos Iniciales
  await cargarCategoriaMenu();
  actualizarInterfaz();
  
  // 4. Iniciar en Portada y Quitar Loader
  await irASeccion('portada');
  
  // 5. Contador de Visitas
  iniciarContadorVisitas();
  
  // 6. Ocultar pantalla de carga
  setTimeout(() => {
      const loader = document.getElementById('loader-overlay');
      if(loader) {
          loader.style.opacity = '0';
          setTimeout(() => loader.remove(), 500);
      }
  }, 800);
});

function inicializarComponentesBootstrap() {
  toastBootstrap = new bootstrap.Toast(document.getElementById('liveToast'));
  
  // Modales existentes en el HTML
  if(document.getElementById('modalCategoria')) modalCategoriaInst = new bootstrap.Modal(document.getElementById('modalCategoria'));
  if(document.getElementById('modalProducto')) modalProductoInst = new bootstrap.Modal(document.getElementById('modalProducto'));
  if(document.getElementById('modalDatosInvitado')) modalDatosInvitadoInst = new bootstrap.Modal(document.getElementById('modalDatosInvitado'), {backdrop: 'static', keyboard: false});
  if(document.getElementById('modalConfirmacion')) modalConfirmacionInst = new bootstrap.Modal(document.getElementById('modalConfirmacion'), {backdrop: 'static', keyboard: false});
  if(document.getElementById('modalExitoOrden')) modalExitoOrdenInst = new bootstrap.Modal(document.getElementById('modalExitoOrden'));
  if(document.getElementById('modalProductoDetalle')) modalDetalleInst = new bootstrap.Modal(document.getElementById('modalProductoDetalle'));

  // Inyectar Modal de Detalle Pedido (Admin) si falta en el HTML
  if (!document.getElementById('modalDetallePedido')) {
      const modalHTML = `
      <div class="modal fade" id="modalDetallePedido" tabindex="-1">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content rounded-4 border-0">
            <div class="modal-header bg-light border-0"><h5 class="modal-title fw-bold">Detalle del Pedido</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
            <div class="modal-body" id="cuerpoDetallePedido"></div>
            <div class="modal-footer border-0"><button class="btn btn-secondary rounded-pill" data-bs-dismiss="modal">Cerrar</button></div>
          </div>
        </div>
      </div>`;
      document.body.insertAdjacentHTML('beforeend', modalHTML);
  }
  modalDetallePedidoInst = new bootstrap.Modal(document.getElementById('modalDetallePedido'));
}

// ================= CONTADOR DE VISITAS =================
async function iniciarContadorVisitas() {
    const contadorEl = document.getElementById('contador-visitas');
    if (!contadorEl) return;

    try {
        // Intentamos insertar una visita anónima
        await supabaseClient.from('visitas').insert({});
        
        // Contamos el total
        const { count, error } = await supabaseClient.from('visitas').select('*', { count: 'exact', head: true });
        
        if (!error && count !== null) {
            contadorEl.innerText = count.toLocaleString();
        } else {
            throw new Error("No se pudo contar");
        }
    } catch (e) {
        // Si no existe la tabla 'visitas', mostramos un número simulado basado en la fecha
        console.warn("Tabla 'visitas' no detectada o error de conexión. Usando modo local.");
        const base = new Date().getDate() * 100;
        contadorEl.innerText = "+" + (base + Math.floor(Math.random() * 50));
    }
}

// ================= NAVEGACIÓN Y UI =================
async function irASeccion(seccion) {
  // Ocultar todas las secciones
  document.querySelectorAll('.seccion').forEach(s => s.classList.remove('active'));
  
  // Mostrar la elegida con animación
  const activeSection = document.getElementById(seccion);
  if(activeSection) activeSection.classList.add('active');

  // Lógica específica por sección
  if (seccion === 'portada') { 
    await cargarCategorias(); 
    limpiarBusqueda(); 
  }
  else if (seccion === 'carrito') { cargarCarrito(); } 
  else if (seccion === 'adminPanel') {
    if (currentUser?.role !== 'admin') { 
      mostrarToast('Acceso restringido 🚫 Solo administradores.'); 
      irASeccion('portada'); 
      return; 
    }
    await cargarCategoriasAdmin();
    await actualizarBadgeColaAdmin();
  }
  
  // Scroll arriba
  window.scrollTo({top: 0, behavior: 'smooth'});

  // Cerrar menú móvil si está abierto
  const navBar = document.getElementById('navbarNav');
  if (navBar && navBar.classList.contains('show')) {
      const bsCollapse = bootstrap.Collapse.getInstance(navBar);
      if(bsCollapse) bsCollapse.hide();
  }
}

async function actualizarInterfaz() {
  const authBtnContainer = document.getElementById('authButtonsContainer');
  const adminBtnNav = document.getElementById('btnAdminNav');
  const userDropdownContainer = document.getElementById('userDropdownContainer');
  const userNameNav = document.getElementById('userNameNav');
  
  if (usuarioActual && currentUser) {
    authBtnContainer.classList.add('d-none');
    userNameNav.innerText = currentUser.nombre;
    if (currentUser.role === 'admin') { 
        adminBtnNav.classList.remove('d-none'); 
        userDropdownContainer.classList.add('d-none');
    }
    else { 
        adminBtnNav.classList.add('d-none'); 
        userDropdownContainer.classList.remove('d-none'); 
    }
  } else {
    authBtnContainer.classList.remove('d-none');
    adminBtnNav.classList.add('d-none');
    userDropdownContainer.classList.add('d-none');
  }
  actualizarContadorCarrito();
}

function actualizarContadorCarrito() {
  const carrito = getCarrito();
  const total = carrito.reduce((sum, item) => sum + item.cantidad, 0);
  const badge = document.getElementById('cartCount');
  
  badge.innerText = total;
  
  // Animación si cambia el número
  if(total > 0) {
      badge.classList.remove('d-none');
      badge.classList.add('animate-pulse');
      setTimeout(() => badge.classList.remove('animate-pulse'), 500);
  } else {
      badge.classList.add('d-none');
  }
}

function mostrarToast(mensaje) {
  document.getElementById('toastBody').innerText = mensaje;
  toastBootstrap.show();
}

// ================= BASE DE DATOS (DATA LOADING) =================
async function loadCategories() {
  const { data: cats, error } = await supabaseClient.from('categorias').select('*');
  if (error) { console.error("Error categorias:", error); return []; }
  
  // Cargar productos de cada categoría
  for (let cat of cats) {
    const { data: prods } = await supabaseClient.from('productos').select('*').eq('category_id', cat.id);
    cat.productos = prods || [];
  }
  return cats;
}

async function loadPedidos() {
  const { data, error } = await supabaseClient.from('pedidos').select('*').order('id', { ascending: true });
  if (error) console.error(error);
  return data ? data.map(formatPedido) : [];
}

function formatPedido(p) {
  p.fecha = new Date(p.created_at).toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo' });
  return p;
}

// ================= AUTH (USUARIOS) =================
async function registrarUsuario() {
  const nombre = document.getElementById('regNombre').value.trim();
  const apellido = document.getElementById('regApellido').value.trim();
  const direccion = document.getElementById('regDireccion').value.trim();
  const telefono = document.getElementById('regTelefono').value.trim();
  const usuario = document.getElementById('regUser').value.trim();
  const password = document.getElementById('regPass').value.trim();
  const passwordConfirm = document.getElementById('regPassConfirm').value.trim();

  if (!nombre || !apellido || !direccion || !telefono || !usuario || !password) return mostrarToast('Por favor completa todos los campos.');
  if (password !== passwordConfirm) return mostrarToast('Las contraseñas no coinciden.');

  const { error } = await supabaseClient.from('usuarios').insert({
    username: usuario,
    pass: password,
    nombre,
    apellido,
    direccion,
    telefono,
    role: 'user'
  });

  if (error) {
    if (error.code === '23505') return mostrarToast('El nombre de usuario ya existe.');
    return mostrarToast('Error al registrar usuario.');
  }

  mostrarToast('¡Registro exitoso! 🎉 Ingresa ahora.');
  irASeccion('login');
}

async function iniciarSesion() {
  const usuario = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPass').value.trim();

  const { data, error } = await supabaseClient.from('usuarios').select('*').eq('username', usuario).single();

  if (error || !data || data.pass !== password) return mostrarToast('Usuario o contraseña incorrectos.');

  currentUser = data;
  usuarioActual = usuario;
  localStorage.setItem('usuarioActual', usuario);
  actualizarInterfaz();
  mostrarToast(`¡Hola de nuevo, ${currentUser.nombre}!`);
  irASeccion('portada');
}

function cerrarSesion() {
  usuarioActual = null;
  currentUser = null;
  localStorage.removeItem('usuarioActual');
  actualizarInterfaz();
  mostrarToast('Has cerrado sesión correctamente.');
  irASeccion('portada');
}

// ================= TIENDA (CATÁLOGO Y BÚSQUEDA) =================
async function cargarCategorias() {
  categorias = await loadCategories();
  const container = document.getElementById('listaCategorias');
  container.innerHTML = '';
  
  if (categorias.length === 0) {
      container.innerHTML = '<div class="text-center py-5 text-muted">Cargando catálogo...</div>';
      return;
  }

  categorias.forEach(cat => {
    container.innerHTML += `
      <div class="col-6 col-md-3 mb-3">
          <div class="card card-categoria h-100 position-relative" onclick="verProductos('${cat.nombre}')">
              <div class="ratio-4x3">
                 <img src="${cat.img}" alt="${cat.nombre}">
              </div>
              <div class="card-body text-center p-2 p-md-3">
                  <h6 class="card-title fw-bold text-dark m-0">${cat.nombre}</h6>
                  <small class="text-muted">${cat.productos.length} estilos</small>
              </div>
          </div>
      </div>`;
  });
  await cargarCategoriaMenu();
}

async function cargarCategoriaMenu() {
  const menu = document.getElementById('categoriaMenu');
  if(!menu) return;
  menu.innerHTML = '';
  categorias.forEach(cat => {
    menu.innerHTML += `
      <li class="nav-item">
        <a class="nav-link text-dark fw-bold" href="#" onclick="verProductos('${cat.nombre}')">${cat.nombre}</a>
      </li>`;
  });
}

function verProductos(nombreCategoria) {
  const categoria = categorias.find(c => c.nombre === nombreCategoria);
  if (categoria) mostrarProductosEnSeccion(categoria.nombre, categoria.productos);
}

function mostrarProductosEnSeccion(titulo, productos) {
  document.getElementById('tituloCategoria').innerText = titulo;
  const container = document.getElementById('listaProductos');
  container.innerHTML = '';
  
  const cat = categorias.find(c => c.nombre === titulo);

  if (productos.length === 0) {
    container.innerHTML = '<div class="col-12 text-center text-muted py-5">No hay productos disponibles en esta categoría.</div>';
  } else {
    productos.forEach((prod) => {
      // Badge de estado
      let estadoBadge = prod.disponible ? '' : '<span class="position-absolute top-0 end-0 badge bg-danger m-2 shadow-sm">Agotado</span>';
      
      container.innerHTML += `
          <div class="col-6 col-md-3 mb-3">
              <div class="card card-producto h-100 position-relative" onclick="abrirDetalleProducto(${cat.id}, ${prod.id})">
                  ${estadoBadge}
                  <div class="ratio-4x3">
                    <img src="${prod.img}" alt="${prod.nombre}">
                  </div>
                  <div class="card-body text-center p-2 p-md-3 d-flex flex-column">
                      <h6 class="card-title fw-bold text-dark text-truncate">${prod.nombre}</h6>
                      <div class="mt-auto pt-2">
                        <span class="badge-precio">${formatearRD(prod.precio)}</span>
                      </div>
                  </div>
              </div>
          </div>`;
    });
  }
  irASeccion('productos');
}

function abrirDetalleProducto(catId, prodId) {
  // Asegurar modal
  if(!modalDetalleInst) modalDetalleInst = new bootstrap.Modal(document.getElementById('modalProductoDetalle'));
  
  const cat = categorias.find(c => c.id === catId);
  const prod = cat?.productos.find(p => p.id === prodId);
  
  if (!prod) return;
  
  // Llenar datos
  document.getElementById('detalleImg').src = prod.img;
  document.getElementById('detalleCat').innerText = cat.nombre;
  document.getElementById('detalleNombre').innerText = prod.nombre;
  document.getElementById('detallePrecio').innerText = formatearRD(prod.precio);
  
  const desc = prod.descripcion || "Personalizamos este artículo a tu gusto con los colores y detalles que prefieras.";
  document.getElementById('detalleDesc').innerText = desc;
  
  const estadoEl = document.getElementById('detalleEstado');
  const btnAgregar = document.getElementById('btnAgregarDetalle');

  if(prod.disponible === false) {
      estadoEl.innerHTML = '<span class="badge bg-danger fs-6">Agotado Temporalmente</span>';
      btnAgregar.disabled = true;
      btnAgregar.innerText = "No disponible";
      btnAgregar.classList.replace('btn-primary', 'btn-secondary');
      btnAgregar.onclick = null;
  } else {
      estadoEl.innerHTML = '<span class="badge bg-success bg-opacity-10 text-success fs-6 border border-success">Disponible</span>';
      btnAgregar.disabled = false;
      btnAgregar.innerHTML = '<i class="bi bi-cart-plus me-2"></i>Agregar al Carrito';
      btnAgregar.classList.replace('btn-secondary', 'btn-primary');
      btnAgregar.onclick = function() {
          agregarAlCarrito(prod);
          modalDetalleInst.hide();
      };
  }

  modalDetalleInst.show();
}

function buscarProductos() {
  const query = document.getElementById('searchInput').value.trim().toLowerCase();
  const contCat = document.getElementById('contenedorCategorias');
  const contRes = document.getElementById('contenedorResultados');
  const listaRes = document.getElementById('listaResultados');

  if (query === '') { 
    contCat.classList.remove('d-none'); 
    contRes.classList.add('d-none'); 
    return; 
  }

  contCat.classList.add('d-none'); 
  contRes.classList.remove('d-none'); 
  listaRes.innerHTML = '';
  
  let resultados = [];
  categorias.forEach((cat) => {
    cat.productos.forEach((prod) => {
      if (prod.nombre.toLowerCase().includes(query)) {
        resultados.push({prod, catId: cat.id});
      }
    });
  });

  if(resultados.length === 0) {
    listaRes.innerHTML = '<div class="col-12 text-center py-5 text-muted">No encontramos productos con ese nombre.</div>';
  } else {
      resultados.forEach(r => {
          listaRes.innerHTML += `
              <div class="col-6 col-md-3 mb-3">
                  <div class="card card-producto h-100" onclick="abrirDetalleProducto(${r.catId}, ${r.prod.id})">
                      <div class="ratio-4x3">
                        <img src="${r.prod.img}" alt="${r.prod.nombre}">
                      </div>
                      <div class="card-body text-center p-2 p-md-3">
                          <h6 class="card-title fw-bold">${r.prod.nombre}</h6>
                          <span class="badge-precio small">${formatearRD(r.prod.precio)}</span>
                      </div>
                  </div>
              </div>`;
      });
  }
}

function limpiarBusqueda() { 
  document.getElementById('searchInput').value = ''; 
  buscarProductos(); 
}

// ================= CARRITO =================
function getCarrito() {
  const key = usuarioActual ? `carrito_${usuarioActual}` : `carrito_invitado`;
  return JSON.parse(localStorage.getItem(key)) || [];
}

function setCarrito(carritoData) {
  const key = usuarioActual ? `carrito_${usuarioActual}` : `carrito_invitado`;
  localStorage.setItem(key, JSON.stringify(carritoData));
}

function agregarAlCarrito(producto) {
  const carrito = getCarrito();
  const item = carrito.find(p => p.nombre === producto.nombre);
  
  if (item) {
      item.cantidad++;
  } else {
      carrito.push({ 
          nombre: producto.nombre, 
          precio: producto.precio, 
          img: producto.img, 
          descripcion: producto.descripcion || "", 
          cantidad: 1 
      });
  }
  
  setCarrito(carrito);
  actualizarContadorCarrito();
  mostrarToast(`${producto.nombre} agregado al carrito 🛒`);
}

function cargarCarrito() {
  const carrito = getCarrito();
  const container = document.getElementById('listaCarrito'); 
  container.innerHTML = '';
  
  if (carrito.length === 0) {
    container.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-5"><i class="bi bi-cart-x fs-1 d-block mb-2"></i>Tu carrito está vacío</td></tr>';
    document.getElementById('totalCarrito').innerText = 'RD$0.00';
    return;
  }
  
  let total = 0;
  carrito.forEach((item, index) => {
    total += item.precio * item.cantidad;
    container.innerHTML += `
      <tr>
          <td>
              <div class="d-flex align-items-center">
                  <img src="${item.img}" class="rounded-3 shadow-sm border" style="width:50px;height:50px;object-fit:cover;margin-right:15px;">
                  <div>
                      <div class="fw-bold">${item.nombre}</div>
                  </div>
              </div>
          </td>
          <td class="text-center small">${formatearRD(item.precio)}</td>
          <td class="text-center">
              <div class="input-group input-group-sm justify-content-center" style="width: 100px; margin: auto;">
                  <button class="btn btn-outline-secondary" onclick="cambiarCantidad(${index}, -1)">-</button>
                  <span class="input-group-text bg-white">${item.cantidad}</span>
                  <button class="btn btn-outline-secondary" onclick="cambiarCantidad(${index}, 1)">+</button>
              </div>
          </td>
          <td class="text-center fw-bold text-primary">${formatearRD(item.precio*item.cantidad)}</td>
          <td class="text-center">
              <button class="btn btn-sm text-danger" onclick="eliminarDelCarrito(${index})"><i class="bi bi-trash-fill"></i></button>
          </td>
      </tr>`;
  });
  document.getElementById('totalCarrito').innerText = formatearRD(total);
}

function cambiarCantidad(index, d) {
  const carrito = getCarrito();
  carrito[index].cantidad += d;
  if (carrito[index].cantidad <= 0) carrito.splice(index, 1);
  setCarrito(carrito); 
  cargarCarrito(); 
  actualizarContadorCarrito();
}

function eliminarDelCarrito(i) {
  const c = getCarrito(); 
  c.splice(i, 1); 
  setCarrito(c); 
  cargarCarrito(); 
  actualizarContadorCarrito();
}

function vaciarCarrito() { 
  localStorage.removeItem(usuarioActual ? `carrito_${usuarioActual}` : `carrito_invitado`);
  cargarCarrito(); 
  actualizarContadorCarrito(); 
}

// ================= PROCESAR ORDEN / WHATSAPP =================
function solicitarConfirmacion(tipo) {
    const carrito = getCarrito();
    if(carrito.length === 0) return mostrarToast('El carrito está vacío. Agrega productos primero.');
    accionPendiente = tipo;
    
    let mensaje = "";
    if(tipo === 'imprimir_descargar') mensaje = "¿Deseas generar la cotización en PDF?";
    else if(tipo === 'whatsapp') mensaje = "Te redirigiremos a WhatsApp con el detalle de tu pedido.";
    
    document.getElementById('textoConfirmacion').innerText = mensaje;
    
    document.getElementById('btnConfirmarAccion').onclick = async function() {
        modalConfirmacionInst.hide();
        await prepararDatosParaAccion();
    };
    modalConfirmacionInst.show();
}

async function prepararDatosParaAccion() {
    if(usuarioActual && currentUser) {
        // Usuario logueado
        if (accionPendiente === 'imprimir_descargar') abrirVentanaImpresion();
        await ejecutarAccionConDatos(currentUser);
    } else {
        // Invitado
        modalDatosInvitadoInst.show();
    }
}

function abrirVentanaImpresion() {
    printWindow = window.open('', '_blank');
    if (printWindow) {
        printWindow.document.write('<div style="font-family:sans-serif;text-align:center;padding-top:50px;">Cargando factura...</div>');
    }
}

async function confirmarDatosInvitado() {
  const nombre = document.getElementById('invNombre').value.trim();
  const apellido = document.getElementById('invApellido').value.trim();
  const telefono = document.getElementById('invTelefono').value.trim();

  if (!nombre || !apellido || !telefono) return mostrarToast('Por favor completa tus datos.');

  modalDatosInvitadoInst.hide();
  
  if (accionPendiente === 'imprimir_descargar') abrirVentanaImpresion();

  const clienteData = { nombre, apellido, telefono };
  await ejecutarAccionConDatos(clienteData);
}

async function ejecutarAccionConDatos(clienteData) {
  const carrito = getCarrito();
  const total = carrito.reduce((sum, item) => sum + item.precio * item.cantidad, 0);
  
  const pedido = {
    cliente: { nombre: clienteData.nombre, apellido: clienteData.apellido, telefono: clienteData.telefono },
    items: carrito,
    total: total,
    estado: 'pendiente'
  };

  const { data: newPedido, error } = await supabaseClient.from('pedidos').insert(pedido).select().single();

  if (error || !newPedido) {
    mostrarToast('Hubo un error al guardar el pedido.');
    if(printWindow) printWindow.close();
    return;
  }

  // Éxito
  formatPedido(newPedido);
  
  // Obtener turno
  const { count } = await supabaseClient.from('pedidos').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente');
  const turno = count;

  // Mostrar modal éxito
  document.getElementById('numeroTurnoExito').innerText = `#${turno}`;
  modalExitoOrdenInst.show();

  // Ejecutar acción final
  if (accionPendiente === 'imprimir_descargar' && printWindow) {
      imprimirFactura(newPedido, turno, printWindow);
  } else if (accionPendiente === 'whatsapp') {
      enviarPorWhatsApp(newPedido, turno);
  }

  vaciarCarrito();
  invitadoTemp = null;
  accionPendiente = null;
  printWindow = null;
}

function enviarPorWhatsApp(pedido, turno) {
  let mensaje = `👋 Hola *Mariposas Cuties*, me gustaría realizar el siguiente pedido:\n\n`;
  mensaje += `🔢 *Turno Web:* #${turno}\n`;
  mensaje += `👤 *Cliente:* ${pedido.cliente.nombre} ${pedido.cliente.apellido}\n`;
  mensaje += `📱 *Tel:* ${pedido.cliente.telefono}\n\n`;
  mensaje += `🛒 *DETALLE DEL PEDIDO:*\n`;
  
  pedido.items.forEach(item => {
    mensaje += `- ${item.cantidad}x ${item.nombre} (${formatearRD(item.precio * item.cantidad)})\n`;
  });
  
  mensaje += `\n💰 *TOTAL A PAGAR: ${formatearRD(pedido.total)}*`;
  mensaje += `\n\n_Quedo atento a su confirmación._`;
  
  const numeroTienda = "18096659100"; // Tu número
  const url = `https://wa.me/${numeroTienda}?text=${encodeURIComponent(mensaje)}`;
  
  // Abrir en nueva pestaña
  window.open(url, '_blank');
}

// ================= FACTURA / IMPRESIÓN =================
function imprimirFactura(pedido, turno, win) {
    if (!win) return;

    let filasHTML = '';
    pedido.items.forEach(i => {
        filasHTML += `
          <tr>
              <td style="padding:8px; border-bottom:1px solid #eee;">${i.nombre}</td>
              <td style="padding:8px; text-align:center; border-bottom:1px solid #eee;">${i.cantidad}</td>
              <td style="padding:8px; text-align:right; border-bottom:1px solid #eee;">${formatearRD(i.precio)}</td>
              <td style="padding:8px; text-align:right; border-bottom:1px solid #eee;">${formatearRD(i.precio * i.cantidad)}</td>
          </tr>`;
    });

    win.document.open();
    win.document.write(`
    <html>
    <head>
      <title>Cotización #${pedido.id}</title>
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; color: #333; }
        .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #6a1b9a; padding-bottom: 20px; }
        .logo { font-size: 28px; font-weight: bold; color: #6a1b9a; text-transform: uppercase; letter-spacing: 2px; }
        .info-table { width: 100%; margin-bottom: 20px; }
        .items-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
        .items-table th { background: #6a1b9a; color: white; padding: 10px; text-align: left; }
        .total { text-align: right; font-size: 22px; font-weight: bold; color: #6a1b9a; }
        .footer { text-align: center; margin-top: 50px; font-size: 12px; color: #777; }
        .turno { background: #f3e5f5; padding: 10px; border-radius: 8px; text-align: center; margin: 20px 0; border: 1px dashed #6a1b9a; }
        @media print { .no-print { display: none; } }
      </style>
    </head>
    <body>
        <div class="no-print" style="text-align:center; margin-bottom:20px;">
            <button onclick="window.print()" style="padding:10px 20px; background:#6a1b9a; color:white; border:none; cursor:pointer; font-size:16px; border-radius:5px;">🖨️ Imprimir Factura</button>
            <button onclick="window.close()" style="padding:10px 20px; background:#ccc; border:none; cursor:pointer; font-size:16px; border-radius:5px; margin-left:10px;">Cerrar</button>
        </div>

        <div class="header">
            <div class="logo">Mariposas Cuties</div>
            <div>Detalles y Personalizados</div>
            <div style="font-size: 14px; margin-top: 5px;">Salcedo - Tenares | Tel: 809-665-9100</div>
        </div>

        <table class="info-table">
            <tr>
                <td style="vertical-align: top;">
                    <strong>CLIENTE:</strong><br>
                    ${pedido.cliente.nombre} ${pedido.cliente.apellido}<br>
                    ${pedido.cliente.telefono}
                </td>
                <td style="text-align: right; vertical-align: top;">
                    <strong>ORDEN #${pedido.id}</strong><br>
                    Fecha: ${pedido.fecha}<br>
                    Estado: ${pedido.estado.toUpperCase()}
                </td>
            </tr>
        </table>

        ${turno ? `<div class="turno"><strong>TU TURNO EN COLA:</strong> <span style="font-size:24px; font-weight:bold;">#${turno}</span></div>` : ''}

        <table class="items-table">
            <thead>
                <tr>
                    <th>Producto</th>
                    <th style="text-align:center;">Cant.</th>
                    <th style="text-align:right;">Precio</th>
                    <th style="text-align:right;">Total</th>
                </tr>
            </thead>
            <tbody>
                ${filasHTML}
            </tbody>
        </table>

        <div class="total">
            Total a Pagar: ${formatearRD(pedido.total)}
        </div>

        <div class="footer">
            <p>Gracias por preferir nuestros servicios.<br>¡Hacemos tus ideas realidad!</p>
        </div>
    </body>
    </html>`);
    win.document.close();
}

// ================= ADMIN (LÓGICA PANEL) =================
async function actualizarBadgeColaAdmin() {
  const { count } = await supabaseClient.from('pedidos').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente');
  const badge = document.getElementById('badgeColaAdmin');
  if(badge) badge.innerText = count || 0;
}

async function cargarCategoriasAdmin() {
  categorias = await loadCategories();
  const container = document.getElementById('tablaCategoriasAdmin'); 
  if(!container) return;
  container.innerHTML = '';
  categorias.forEach((cat) => {
    container.innerHTML += `
      <tr>
          <td class="align-middle"><img src="${cat.img}" style="width:40px; height:40px; object-fit:cover; border-radius:5px;"></td>
          <td class="align-middle fw-bold">${cat.nombre}</td>
          <td class="text-end">
              <button class="btn btn-sm btn-light border" onclick="prepararFormularioCategoria(${cat.id})" data-bs-toggle="modal" data-bs-target="#modalCategoria"><i class="bi bi-pencil"></i></button>
              <button class="btn btn-sm btn-danger ms-1" onclick="eliminarCategoria(${cat.id})"><i class="bi bi-trash"></i></button>
          </td>
      </tr>`;
  });
}

async function cargarProductosAdmin() {
  categorias = await loadCategories();
  const container = document.getElementById('tablaProductosAdmin'); 
  if(!container) return;
  container.innerHTML = '';
  categorias.forEach((cat) => {
    cat.productos.forEach((prod) => {
      let estado = prod.disponible ? '<span class="badge bg-success">Activo</span>' : '<span class="badge bg-danger">Agotado</span>';
      container.innerHTML += `
          <tr>
              <td class="align-middle"><img src="${prod.img}" style="width:40px; height:40px; object-fit:cover; border-radius:5px;"></td>
              <td class="align-middle">
                <div class="fw-bold">${prod.nombre}</div>
                <small class="text-muted">${cat.nombre}</small>
              </td>
              <td class="align-middle">${formatearRD(prod.precio)}</td>
              <td class="align-middle">${estado}</td>
              <td class="text-end align-middle">
                  <button class="btn btn-sm btn-light border" onclick="prepararFormularioProducto(${cat.id}, ${prod.id})" data-bs-toggle="modal" data-bs-target="#modalProducto"><i class="bi bi-pencil"></i></button>
                  <button class="btn btn-sm btn-danger ms-1" onclick="eliminarProducto(${cat.id}, ${prod.id})"><i class="bi bi-trash"></i></button>
              </td>
          </tr>`;
    });
  });
}

async function cargarPedidosAdmin() {
  historialPedidos = await loadPedidos();
  const container = document.getElementById('listaPedidosAdmin');
  if(!container) return;
  container.innerHTML = '';

  // Ordenar: Pendientes primero
  const listaOrdenada = historialPedidos.sort((a,b) => {
      if (a.estado === 'pendiente' && b.estado !== 'pendiente') return -1;
      if (a.estado !== 'pendiente' && b.estado === 'pendiente') return 1;
      return b.id - a.id;
  });

  listaOrdenada.forEach((p) => {
      let color = p.estado === 'pendiente' ? 'border-warning border-start border-5' : 'border-success border-start border-5 opacity-75';
      let badge = p.estado === 'pendiente' ? '<span class="badge bg-warning text-dark">Pendiente</span>' : '<span class="badge bg-success">Completado</span>';
      
      // Botón completar solo si está pendiente
      let btnAccion = p.estado === 'pendiente' 
        ? `<button class="btn btn-sm btn-success w-100 mt-2" onclick="marcarPedidoCompletado(${p.id})">Marcar Completado</button>` 
        : '';

      container.innerHTML += `
        <div class="col-md-6 col-lg-4">
            <div class="card shadow-sm mb-3 ${color}">
                <div class="card-body">
                    <div class="d-flex justify-content-between mb-2">
                        <span class="fw-bold">#${p.id}</span>
                        ${badge}
                    </div>
                    <h5 class="card-title text-primary fw-bold">${p.cliente.nombre} ${p.cliente.apellido}</h5>
                    <p class="mb-1 text-muted"><i class="bi bi-whatsapp me-1"></i>${p.cliente.telefono}</p>
                    <p class="mb-1 small text-muted">${p.fecha}</p>
                    <h6 class="mt-2 fw-bold text-end">Total: ${formatearRD(p.total)}</h6>
                    <hr>
                    <button class="btn btn-sm btn-outline-dark w-100" onclick='verDetallePedido(${JSON.stringify(p)})'>Ver Detalles</button>
                    ${btnAccion}
                </div>
            </div>
        </div>`;
  });
}

function verDetallePedido(pedido) {
    const cuerpo = document.getElementById('cuerpoDetallePedido');
    let itemsHtml = '';
    pedido.items.forEach(i => {
        itemsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">
            ${i.cantidad} x ${i.nombre}
            <span class="fw-bold">${formatearRD(i.precio*i.cantidad)}</span>
        </li>`;
    });

    cuerpo.innerHTML = `
      <div class="alert alert-light border">
          <strong>Cliente:</strong> ${pedido.cliente.nombre} ${pedido.cliente.apellido}<br>
          <strong>Teléfono:</strong> <a href="https://wa.me/${pedido.cliente.telefono.replace(/[^0-9]/g, '')}" target="_blank">${pedido.cliente.telefono}</a>
      </div>
      <h6>Productos:</h6>
      <ul class="list-group list-group-flush mb-3">${itemsHtml}</ul>
      <h4 class="text-end text-primary fw-bold">Total: ${formatearRD(pedido.total)}</h4>
    `;
    modalDetallePedidoInst.show();
}

async function marcarPedidoCompletado(id) {
    if(confirm('¿Confirmar que el pedido ya fue entregado?')) {
        const { error } = await supabaseClient.from('pedidos').update({estado: 'completado'}).eq('id', id);
        if(!error) {
            cargarPedidosAdmin();
            mostrarToast("Pedido completado ✅");
        }
    }
}

// Funciones CRUD Categorias/Productos (Simplificadas para funcionar con Modales)
function prepararFormularioCategoria(id){
    document.getElementById('catId').value = id || '';
    // Si id existe, llenar datos... (Omitido lógica de búsqueda simple por brevedad, asumiendo crear nueva)
    // Para producción: buscar en array 'categorias' el id y llenar inputs
    if(id){
        const c = categorias.find(x => x.id == id);
        if(c){
            document.getElementById('catNombre').value = c.nombre;
            document.getElementById('catImg').value = c.img;
        }
    } else {
        document.getElementById('catNombre').value = '';
        document.getElementById('catImg').value = '';
    }
}

async function guardarCategoria(){
    const id = document.getElementById('catId').value;
    const nombre = document.getElementById('catNombre').value;
    const img = document.getElementById('catImg').value;
    
    if(!nombre || !img) return alert("Datos incompletos");
    
    let error;
    if(id){
        const res = await supabaseClient.from('categorias').update({nombre, img}).eq('id', id);
        error = res.error;
    } else {
        const res = await supabaseClient.from('categorias').insert({nombre, img});
        error = res.error;
    }
    
    if(!error){
        modalCategoriaInst.hide();
        cargarCategoriasAdmin();
        mostrarToast("Categoría guardada");
    }
}

async function eliminarCategoria(id){
    if(confirm("¿Eliminar categoría y sus productos?")){
        await supabaseClient.from('categorias').delete().eq('id', id);
        cargarCategoriasAdmin();
    }
}

function prepararFormularioProducto(catId, prodId){
    const select = document.getElementById('prodCatId');
    select.innerHTML = '';
    categorias.forEach(c => {
        select.innerHTML += `<option value="${c.id}">${c.nombre}</option>`;
    });
    
    document.getElementById('prodId').value = prodId || '';
    
    if(prodId){
        const cat = categorias.find(c => c.id == catId);
        const prod = cat.productos.find(p => p.id == prodId);
        select.value = catId;
        document.getElementById('prodNombre').value = prod.nombre;
        document.getElementById('prodPrecio').value = prod.precio;
        document.getElementById('prodImg').value = prod.img;
        document.getElementById('prodDesc').value = prod.descripcion || '';
        document.getElementById('prodDisponible').checked = prod.disponible;
    } else {
        document.getElementById('prodNombre').value = '';
        document.getElementById('prodPrecio').value = '';
        document.getElementById('prodImg').value = '';
        document.getElementById('prodDesc').value = '';
    }
}

async function guardarProducto(){
    const id = document.getElementById('prodId').value;
    const catId = document.getElementById('prodCatId').value;
    const nombre = document.getElementById('prodNombre').value;
    const precio = document.getElementById('prodPrecio').value;
    const img = document.getElementById('prodImg').value;
    const desc = document.getElementById('prodDesc').value;
    const disp = document.getElementById('prodDisponible').checked;

    if(!nombre || !precio) return alert("Faltan datos");

    const payload = { category_id: catId, nombre, precio, img, descripcion: desc, disponible: disp };
    let error;
    
    if(id){
        const res = await supabaseClient.from('productos').update(payload).eq('id', id);
        error = res.error;
    } else {
        const res = await supabaseClient.from('productos').insert(payload);
        error = res.error;
    }
    
    if(!error){
        modalProductoInst.hide();
        cargarProductosAdmin();
        mostrarToast("Producto guardado");
    }
}

async function eliminarProducto(catId, prodId){
    if(confirm("¿Eliminar producto?")){
        await supabaseClient.from('productos').delete().eq('id', prodId);
        cargarProductosAdmin();
    }
}
