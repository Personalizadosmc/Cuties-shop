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
let printWindow = null; 

// Instancias de Bootstrap
let toastBootstrap, modalCategoriaInst, modalProductoInst, modalDatosInvitadoInst, modalDetallePedidoInst, modalConfirmacionInst, modalExitoOrdenInst, modalDetalleInst;

function formatearRD(monto) {
  return 'RD$ ' + monto.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// ================= INICIALIZACIÓN (DOM READY) =================
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Inicializar Modales
  inicializarComponentesBootstrap();
  
  // 2. Verificar Sesión
  if (usuarioActual) {
    const { data } = await supabaseClient.from('usuarios').select('*').eq('username', usuarioActual).single();
    if (data) currentUser = data;
    else { localStorage.removeItem('usuarioActual'); usuarioActual = null; }
  }
  
  // 3. Cargar Datos y UI
  await cargarCategoriaMenu();
  actualizarInterfaz();
  await irASeccion('portada');
  
  // 4. Contador de Visitas
  iniciarContadorVisitas();
  
  // 5. Quitar Loader
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
  
  // Modales principales
  if(document.getElementById('modalCategoria')) modalCategoriaInst = new bootstrap.Modal(document.getElementById('modalCategoria'));
  if(document.getElementById('modalProducto')) modalProductoInst = new bootstrap.Modal(document.getElementById('modalProducto'));
  if(document.getElementById('modalDatosInvitado')) modalDatosInvitadoInst = new bootstrap.Modal(document.getElementById('modalDatosInvitado'), {backdrop: 'static', keyboard: false});
  if(document.getElementById('modalConfirmacion')) modalConfirmacionInst = new bootstrap.Modal(document.getElementById('modalConfirmacion'), {backdrop: 'static', keyboard: false});
  if(document.getElementById('modalExitoOrden')) modalExitoOrdenInst = new bootstrap.Modal(document.getElementById('modalExitoOrden'));
  if(document.getElementById('modalProductoDetalle')) modalDetalleInst = new bootstrap.Modal(document.getElementById('modalProductoDetalle'));

  // Inyectar Modal Detalle Pedido (Admin) si falta
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
    const contadorEls = document.querySelectorAll('#contador-visitas'); 
    if (contadorEls.length === 0) return;

    try {
        await supabaseClient.from('visitas').insert({});
        const { count, error } = await supabaseClient.from('visitas').select('*', { count: 'exact', head: true });
        
        if (!error && count !== null) {
            contadorEls.forEach(el => el.innerText = count.toLocaleString());
        }
    } catch (e) {
        console.warn("Usando contador local.");
        contadorEls.forEach(el => el.innerText = "1,245"); // Número simulado
    }
}

// ================= NAVEGACIÓN =================
async function irASeccion(seccion) {
  document.querySelectorAll('.seccion').forEach(s => s.classList.remove('active'));
  const activeSection = document.getElementById(seccion);
  if(activeSection) activeSection.classList.add('active');

  if (seccion === 'portada') { 
    await cargarCategorias(); 
    limpiarBusqueda(); 
  }
  else if (seccion === 'carrito') { cargarCarrito(); } 
  else if (seccion === 'adminPanel') {
    if (currentUser?.role !== 'admin') { 
      mostrarToast('🚫 Acceso solo para administradores.'); 
      irASeccion('portada'); 
      return; 
    }
    await cargarCategoriasAdmin();
    await actualizarBadgeColaAdmin();
  }
  
  window.scrollTo({top: 0, behavior: 'smooth'});

  const navBar = document.getElementById('navbarNav');
  if (navBar && navBar.classList.contains('show')) {
      bootstrap.Collapse.getInstance(navBar).hide();
  }
}

function actualizarInterfaz() {
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
    } else { 
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

// ================= DATA LOADING =================
async function loadCategories() {
  const { data: cats, error } = await supabaseClient.from('categorias').select('*');
  if (error) return [];
  for (let cat of cats) {
    const { data: prods } = await supabaseClient.from('productos').select('*').eq('category_id', cat.id);
    cat.productos = prods || [];
  }
  return cats;
}

async function loadPedidos() {
  const { data } = await supabaseClient.from('pedidos').select('*').order('id', { ascending: true });
  return data ? data.map(formatPedido) : [];
}

function formatPedido(p) {
  p.fecha = new Date(p.created_at).toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo' });
  return p;
}

// ================= AUTH =================
async function registrarUsuario() {
  const nombre = document.getElementById('regNombre').value.trim();
  const apellido = document.getElementById('regApellido').value.trim();
  const direccion = document.getElementById('regDireccion').value.trim();
  const telefono = document.getElementById('regTelefono').value.trim();
  const usuario = document.getElementById('regUser').value.trim();
  const password = document.getElementById('regPass').value.trim();
  const passwordConfirm = document.getElementById('regPassConfirm').value.trim();

  if (!nombre || !usuario || !password) return mostrarToast('Completa los campos obligatorios.');
  if (password !== passwordConfirm) return mostrarToast('Las contraseñas no coinciden.');

  const { error } = await supabaseClient.from('usuarios').insert({
    username: usuario, pass: password, nombre, apellido, direccion, telefono, role: 'user'
  });

  if (error) return mostrarToast('Error: El usuario ya existe o hubo un fallo.');
  mostrarToast('¡Registro exitoso! Ingresa ahora.');
  irASeccion('login');
}

async function iniciarSesion() {
  const usuario = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPass').value.trim();

  const { data, error } = await supabaseClient.from('usuarios').select('*').eq('username', usuario).single();

  if (error || !data || data.pass !== password) return mostrarToast('Datos incorrectos.');

  currentUser = data;
  usuarioActual = usuario;
  localStorage.setItem('usuarioActual', usuario);
  actualizarInterfaz();
  mostrarToast(`¡Bienvenido, ${currentUser.nombre}!`);
  irASeccion('portada');
}

function cerrarSesion() {
  usuarioActual = null;
  currentUser = null;
  localStorage.removeItem('usuarioActual');
  actualizarInterfaz();
  irASeccion('portada');
}

// ================= TIENDA =================
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
          <div class="card card-categoria h-100" onclick="verProductos('${cat.nombre}')">
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
    menu.innerHTML += `<li class="nav-item"><a class="nav-link fw-bold" href="#" onclick="verProductos('${cat.nombre}')">${cat.nombre}</a></li>`;
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
    container.innerHTML = '<div class="col-12 text-center text-muted py-5">Categoría vacía por el momento.</div>';
  } else {
    productos.forEach((prod) => {
      let estadoBadge = prod.disponible ? '' : '<span class="position-absolute top-0 end-0 badge bg-danger m-2 shadow-sm">Agotado</span>';
      container.innerHTML += `
          <div class="col-6 col-md-3 mb-3">
              <div class="card card-producto h-100" onclick="abrirDetalleProducto(${cat.id}, ${prod.id})">
                  ${estadoBadge}
                  <div class="ratio-4x3"><img src="${prod.img}" alt="${prod.nombre}"></div>
                  <div class="card-body text-center p-2 p-md-3 d-flex flex-column">
                      <h6 class="card-title fw-bold text-truncate">${prod.nombre}</h6>
                      <div class="mt-auto pt-1"><span class="badge-precio">${formatearRD(prod.precio)}</span></div>
                  </div>
              </div>
          </div>`;
    });
  }
  irASeccion('productos');
}

function abrirDetalleProducto(catId, prodId) {
  if(!modalDetalleInst) modalDetalleInst = new bootstrap.Modal(document.getElementById('modalProductoDetalle'));
  const cat = categorias.find(c => c.id === catId);
  const prod = cat?.productos.find(p => p.id === prodId);
  if (!prod) return;
  
  document.getElementById('detalleImg').src = prod.img;
  document.getElementById('detalleCat').innerText = cat.nombre;
  document.getElementById('detalleNombre').innerText = prod.nombre;
  document.getElementById('detallePrecio').innerText = formatearRD(prod.precio);
  document.getElementById('detalleDesc').innerText = prod.descripcion || "Producto personalizado a tu gusto.";
  
  const estadoEl = document.getElementById('detalleEstado');
  const btnAgregar = document.getElementById('btnAgregarDetalle');

  if(prod.disponible === false) {
      estadoEl.innerHTML = '<span class="badge bg-danger">Agotado Temporalmente</span>';
      btnAgregar.disabled = true;
      btnAgregar.innerText = "No disponible";
      btnAgregar.onclick = null;
  } else {
      estadoEl.innerHTML = '<span class="badge bg-success bg-opacity-10 text-success border border-success">Disponible</span>';
      btnAgregar.disabled = false;
      btnAgregar.innerText = 'Agregar al Carrito';
      btnAgregar.onclick = function() { agregarAlCarrito(prod); modalDetalleInst.hide(); };
  }
  modalDetalleInst.show();
}

function buscarProductos() {
  const query = document.getElementById('searchInput').value.trim().toLowerCase();
  const contCat = document.getElementById('contenedorCategorias');
  const contRes = document.getElementById('contenedorResultados');
  const listaRes = document.getElementById('listaResultados');

  if (query === '') { contCat.classList.remove('d-none'); contRes.classList.add('d-none'); return; }

  contCat.classList.add('d-none'); 
  contRes.classList.remove('d-none'); 
  listaRes.innerHTML = '';
  
  let resultados = [];
  categorias.forEach(cat => cat.productos.forEach(prod => {
      if (prod.nombre.toLowerCase().includes(query)) resultados.push({prod, catId: cat.id});
  }));

  if(resultados.length === 0) {
    listaRes.innerHTML = '<div class="col-12 text-center py-5 text-muted">Sin resultados.</div>';
  } else {
      resultados.forEach(r => {
          listaRes.innerHTML += `
              <div class="col-6 col-md-3 mb-3">
                  <div class="card card-producto h-100" onclick="abrirDetalleProducto(${r.catId}, ${r.prod.id})">
                      <div class="ratio-4x3"><img src="${r.prod.img}"></div>
                      <div class="card-body text-center p-2"><h6 class="fw-bold">${r.prod.nombre}</h6><span class="badge-precio small">${formatearRD(r.prod.precio)}</span></div>
                  </div>
              </div>`;
      });
  }
}

function limpiarBusqueda() { document.getElementById('searchInput').value = ''; buscarProductos(); }

// ================= CARRITO =================
function getCarrito() { return JSON.parse(localStorage.getItem(usuarioActual ? `carrito_${usuarioActual}` : `carrito_invitado`)) || []; }
function setCarrito(c) { localStorage.setItem(usuarioActual ? `carrito_${usuarioActual}` : `carrito_invitado`, JSON.stringify(c)); }

function agregarAlCarrito(prod) {
  const carrito = getCarrito();
  const item = carrito.find(p => p.nombre === prod.nombre);
  if (item) item.cantidad++;
  else carrito.push({ nombre: prod.nombre, precio: prod.precio, img: prod.img, cantidad: 1 });
  setCarrito(carrito);
  actualizarContadorCarrito();
  mostrarToast('Agregado al carrito 🛒');
}

function cargarCarrito() {
  const carrito = getCarrito();
  const container = document.getElementById('listaCarrito'); 
  container.innerHTML = '';
  if (carrito.length === 0) {
    container.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-5">Carrito vacío</td></tr>';
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
                  <img src="${item.img}" style="width:40px;height:40px;object-fit:cover;border-radius:5px;margin-right:10px;">
                  <span class="fw-bold small">${item.nombre}</span>
              </div>
          </td>
          <td class="text-center small">${formatearRD(item.precio)}</td>
          <td class="text-center">
             <div class="input-group input-group-sm justify-content-center" style="width: 80px; margin: auto;">
               <button class="btn btn-outline-secondary px-2" onclick="cambiarCantidad(${index}, -1)">-</button>
               <span class="input-group-text bg-white px-2">${item.cantidad}</span>
               <button class="btn btn-outline-secondary px-2" onclick="cambiarCantidad(${index}, 1)">+</button>
             </div>
          </td>
          <td class="text-center fw-bold text-primary small">${formatearRD(item.precio*item.cantidad)}</td>
          <td class="text-center"><button class="btn btn-sm text-danger" onclick="eliminarDelCarrito(${index})"><i class="bi bi-trash"></i></button></td>
      </tr>`;
  });
  document.getElementById('totalCarrito').innerText = formatearRD(total);
}

function cambiarCantidad(i, d) {
  const c = getCarrito();
  c[i].cantidad += d;
  if (c[i].cantidad <= 0) c.splice(i, 1);
  setCarrito(c); cargarCarrito(); actualizarContadorCarrito();
}

function eliminarDelCarrito(i) {
  const c = getCarrito();
  c.splice(i, 1);
  setCarrito(c); cargarCarrito(); actualizarContadorCarrito();
}

function vaciarCarrito() { 
  localStorage.removeItem(usuarioActual ? `carrito_${usuarioActual}` : `carrito_invitado`);
  cargarCarrito(); actualizarContadorCarrito(); 
}

// ================= PROCESAR ORDEN / WHATSAPP / PDF =================
function solicitarConfirmacion(tipo) {
    if(getCarrito().length === 0) return mostrarToast('Carrito vacío.');
    accionPendiente = tipo;
    
    // Texto del modal
    document.getElementById('textoConfirmacion').innerText = (tipo === 'imprimir_descargar') 
        ? "¿Generar PDF de la cotización?" 
        : "Confirmar pedido para enviarlo por WhatsApp.";

    document.getElementById('btnConfirmarAccion').onclick = async function() {
        modalConfirmacionInst.hide();
        await prepararDatosParaAccion();
    };
    modalConfirmacionInst.show();
}

async function prepararDatosParaAccion() {
    if(usuarioActual && currentUser) {
        if (accionPendiente === 'imprimir_descargar') abrirVentanaImpresion();
        await ejecutarAccionConDatos(currentUser);
    } else {
        modalDatosInvitadoInst.show();
    }
}

function abrirVentanaImpresion() {
    printWindow = window.open('', '_blank');
    if (printWindow) printWindow.document.write('<div style="text-align:center;padding:50px;font-family:sans-serif;">Generando factura con logo...</div>');
}

async function confirmarDatosInvitado() {
  const nombre = document.getElementById('invNombre').value.trim();
  const apellido = document.getElementById('invApellido').value.trim();
  const telefono = document.getElementById('invTelefono').value.trim();
  if (!nombre || !telefono) return mostrarToast('Faltan datos.');

  modalDatosInvitadoInst.hide();
  if (accionPendiente === 'imprimir_descargar') abrirVentanaImpresion();
  await ejecutarAccionConDatos({ nombre, apellido, telefono });
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
    mostrarToast('Error al guardar pedido.');
    if(printWindow) printWindow.close();
    return;
  }

  // Obtener turno
  formatPedido(newPedido);
  const { count } = await supabaseClient.from('pedidos').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente');
  const turno = count;

  // Mostrar Éxito
  document.getElementById('numeroTurnoExito').innerText = `#${turno}`;
  
  // Resetear botón manual de whatsapp
  const containerBtn = document.getElementById('containerBtnWhatsappManual');
  const btnManual = document.getElementById('btnWhatsappManual');
  containerBtn.classList.add('d-none');

  if (accionPendiente === 'imprimir_descargar' && printWindow) {
      imprimirFactura(newPedido, turno, printWindow);
  } else if (accionPendiente === 'whatsapp') {
      // Generar URL
      const urlWhatsapp = generarLinkWhatsApp(newPedido, turno);
      
      // 1. Configurar botón manual por si falla el automático
      btnManual.href = urlWhatsapp;
      containerBtn.classList.remove('d-none');
      
      // 2. Intentar abrir automáticamente
      const w = window.open(urlWhatsapp, '_blank');
      if(!w || w.closed || typeof w.closed=='undefined') {
          mostrarToast('Pulsa el botón verde para abrir WhatsApp.');
      }
  }

  modalExitoOrdenInst.show();
  vaciarCarrito();
  accionPendiente = null;
  printWindow = null;
}

function generarLinkWhatsApp(pedido, turno) {
  let mensaje = `👋 Hola *Mariposas Cuties*, deseo realizar este pedido:\n\n`;
  mensaje += `🔢 *Turno:* #${turno}\n`;
  mensaje += `👤 *Cliente:* ${pedido.cliente.nombre} ${pedido.cliente.apellido}\n`;
  mensaje += `📱 *Contacto:* ${pedido.cliente.telefono}\n\n`;
  mensaje += `🛒 *PEDIDO:*\n`;
  
  pedido.items.forEach(item => {
    mensaje += `- ${item.cantidad}x ${item.nombre} (${formatearRD(item.precio * item.cantidad)})\n`;
  });
  
  mensaje += `\n💰 *TOTAL: ${formatearRD(pedido.total)}*`;
  mensaje += `\n\n_Espero su confirmación. Gracias._`;
  
  const numeroTienda = "18090000000"; // PON TU NÚMERO AQUÍ
  return `https://wa.me/${numeroTienda}?text=${encodeURIComponent(mensaje)}`;
}

// ================= FACTURA CON LOGO Y FOOTER 2026 =================
function imprimirFactura(pedido, turno, win) {
    if (!win) return;
    let filasHTML = '';
    pedido.items.forEach(i => {
        filasHTML += `<tr>
            <td style="padding:8px;border-bottom:1px solid #eee;">${i.nombre}</td>
            <td style="padding:8px;text-align:center;border-bottom:1px solid #eee;">${i.cantidad}</td>
            <td style="padding:8px;text-align:right;border-bottom:1px solid #eee;">${formatearRD(i.precio)}</td>
            <td style="padding:8px;text-align:right;border-bottom:1px solid #eee;">${formatearRD(i.precio * i.cantidad)}</td>
        </tr>`;
    });

    win.document.open();
    win.document.write(`
    <html>
    <head>
      <title>Cotización #${pedido.id}</title>
      <style>
        body { font-family: 'Helvetica', sans-serif; max-width: 700px; margin: 0 auto; padding: 20px; color: #333; }
        .header { text-align: center; margin-bottom: 20px; border-bottom: 3px solid #6a1b9a; padding-bottom: 20px; }
        .logo-img { width: 80px; height: 80px; object-fit: contain; margin-bottom: 10px; }
        .empresa-nombre { font-size: 24px; font-weight: bold; color: #6a1b9a; text-transform: uppercase; margin: 0; }
        .empresa-desc { font-size: 12px; color: #555; margin-top: 5px; font-style: italic; }
        .info-row { display: flex; justify-content: space-between; margin-bottom: 20px; }
        .items-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
        .items-table th { background: #6a1b9a; color: white; padding: 10px; text-align: left; }
        .total { text-align: right; font-size: 22px; font-weight: bold; color: #6a1b9a; }
        
        .footer { 
            text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; 
            font-size: 11px; color: #777; 
        }
        .social-icons { margin-top: 5px; }
        @media print { .no-print { display: none; } }
      </style>
    </head>
    <body>
        <div class="no-print" style="text-align:center; margin-bottom:15px;">
            <button onclick="window.print()" style="padding:10px 20px;background:#6a1b9a;color:white;border:none;border-radius:5px;cursor:pointer;">🖨️ Imprimir</button>
        </div>

        <div class="header">
            <img src="Logo.PNG" alt="Logo" class="logo-img">
            <h1 class="empresa-nombre">Mariposas Cuties</h1>
            <p class="empresa-desc">Somos una empresa encargada de vender productos totalmente personalizados.</p>
            <div style="font-size: 13px; margin-top: 5px;">
                📍 Salcedo - Tenares, Rep. Dom. | 📞 809-000-0000
            </div>
        </div>

        <div class="info-row">
            <div>
                <strong>CLIENTE:</strong><br>
                ${pedido.cliente.nombre} ${pedido.cliente.apellido}<br>
                ${pedido.cliente.telefono}
            </div>
            <div style="text-align: right;">
                <strong>ORDEN #${pedido.id}</strong><br>
                Fecha: ${pedido.fecha}<br>
                Turno: #${turno || '?'}
            </div>
        </div>

        <table class="items-table">
            <thead><tr><th>Producto</th><th style="text-align:center;">Cant.</th><th style="text-align:right;">Precio</th><th style="text-align:right;">Total</th></tr></thead>
            <tbody>${filasHTML}</tbody>
        </table>

        <div class="total">Total: ${formatearRD(pedido.total)}</div>

        <div class="footer">
            <p><strong>Ubicación:</strong> Salcedo - Tenares, República Dominicana.</p>
            <p><a href="https://maps.google.com" style="color:#6a1b9a;text-decoration:none;">[Ver en Google Maps]</a> | Instagram: @mariposascuties</p>
            <p style="margin-top:10px;">&copy; 2026 Mariposas Cuties. Todos los derechos reservados.</p>
        </div>
    </body>
    </html>`);
    win.document.close();
}

// ================= ADMIN =================
async function actualizarBadgeColaAdmin() {
  const { count } = await supabaseClient.from('pedidos').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente');
  if(document.getElementById('badgeColaAdmin')) document.getElementById('badgeColaAdmin').innerText = count || 0;
}

async function cargarCategoriasAdmin() {
  categorias = await loadCategories();
  const tb = document.getElementById('tablaCategoriasAdmin');
  if(!tb) return;
  tb.innerHTML = '';
  categorias.forEach(cat => {
    tb.innerHTML += `<tr>
        <td class="align-middle"><img src="${cat.img}" style="width:40px;height:40px;object-fit:cover;border-radius:5px;"></td>
        <td class="align-middle fw-bold">${cat.nombre}</td>
        <td class="text-end">
            <button class="btn btn-sm btn-light border" onclick="prepararFormCat(${cat.id})" data-bs-toggle="modal" data-bs-target="#modalCategoria"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-sm btn-danger" onclick="eliminarCategoria(${cat.id})"><i class="bi bi-trash"></i></button>
        </td>
    </tr>`;
  });
}

async function cargarProductosAdmin() {
  categorias = await loadCategories();
  const tb = document.getElementById('tablaProductosAdmin');
  if(!tb) return;
  tb.innerHTML = '';
  categorias.forEach(cat => {
    cat.productos.forEach(prod => {
      tb.innerHTML += `<tr>
          <td class="align-middle"><img src="${prod.img}" style="width:40px;height:40px;object-fit:cover;"></td>
          <td class="align-middle"><div>${prod.nombre}</div><small class="text-muted">${cat.nombre}</small></td>
          <td class="align-middle">${formatearRD(prod.precio)}</td>
          <td class="align-middle">${prod.disponible ? '<span class="badge bg-success">Activo</span>' : '<span class="badge bg-danger">Agotado</span>'}</td>
          <td class="text-end align-middle">
              <button class="btn btn-sm btn-light border" onclick="prepararFormProd(${cat.id},${prod.id})" data-bs-toggle="modal" data-bs-target="#modalProducto"><i class="bi bi-pencil"></i></button>
              <button class="btn btn-sm btn-danger" onclick="eliminarProducto(${prod.id})"><i class="bi bi-trash"></i></button>
          </td>
      </tr>`;
    });
  });
}

async function cargarPedidosAdmin() {
  historialPedidos = await loadPedidos();
  const c = document.getElementById('listaPedidosAdmin');
  if(!c) return;
  c.innerHTML = '';
  historialPedidos.sort((a,b) => (a.estado==='pendiente' && b.estado!=='pendiente') ? -1 : 1).forEach(p => {
      let color = p.estado === 'pendiente' ? 'border-warning border-start border-5' : 'border-success border-start border-5 opacity-75';
      let btnDone = p.estado === 'pendiente' ? `<button class="btn btn-sm btn-success w-100 mt-2" onclick="marcarPedidoCompletado(${p.id})">Completar</button>` : '';
      c.innerHTML += `<div class="col-md-6 col-lg-4"><div class="card shadow-sm mb-3 ${color}"><div class="card-body">
          <div class="d-flex justify-content-between mb-2"><span class="fw-bold">#${p.id}</span>${p.estado==='pendiente'?'<span class="badge bg-warning text-dark">Pendiente</span>':'<span class="badge bg-success">Listo</span>'}</div>
          <h5 class="card-title text-primary fw-bold">${p.cliente.nombre}</h5>
          <p class="mb-1 text-muted"><i class="bi bi-whatsapp"></i> ${p.cliente.telefono}</p>
          <h6 class="mt-2 fw-bold text-end">${formatearRD(p.total)}</h6><hr>
          <button class="btn btn-sm btn-outline-dark w-100" onclick='verDetallePedido(${JSON.stringify(p)})'>Ver</button>${btnDone}
      </div></div></div>`;
  });
}

function verDetallePedido(p) {
    let html = `<ul class="list-group list-group-flush mb-3">`;
    p.items.forEach(i => html += `<li class="list-group-item d-flex justify-content-between">${i.cantidad}x ${i.nombre} <span class="fw-bold">${formatearRD(i.precio*i.cantidad)}</span></li>`);
    html += `</ul><h4 class="text-end text-primary fw-bold">Total: ${formatearRD(p.total)}</h4>`;
    document.getElementById('cuerpoDetallePedido').innerHTML = html;
    modalDetallePedidoInst.show();
}

async function marcarPedidoCompletado(id) {
    if(confirm('¿Pedido entregado?')) {
        await supabaseClient.from('pedidos').update({estado: 'completado'}).eq('id', id);
        cargarPedidosAdmin(); mostrarToast("Completado ✅");
    }
}

// Helpers Form Admin
function prepararFormCat(id) {
    document.getElementById('catId').value = id || '';
    if(id) { const c = categorias.find(x => x.id == id); document.getElementById('catNombre').value = c.nombre; document.getElementById('catImg').value = c.img; }
    else { document.getElementById('catNombre').value = ''; document.getElementById('catImg').value = ''; }
}
async function guardarCategoria() {
    const id = document.getElementById('catId').value, nombre = document.getElementById('catNombre').value, img = document.getElementById('catImg').value;
    if(!nombre) return;
    const { error } = id ? await supabaseClient.from('categorias').update({nombre, img}).eq('id', id) : await supabaseClient.from('categorias').insert({nombre, img});
    if(!error) { modalCategoriaInst.hide(); cargarCategoriasAdmin(); mostrarToast("Guardado"); }
}
async function eliminarCategoria(id) { if(confirm("¿Eliminar?")) { await supabaseClient.from('categorias').delete().eq('id', id); cargarCategoriasAdmin(); } }

function prepararFormProd(catId, prodId) {
    const s = document.getElementById('prodCatId'); s.innerHTML = ''; categorias.forEach(c => s.innerHTML += `<option value="${c.id}">${c.nombre}</option>`);
    document.getElementById('prodId').value = prodId || '';
    if(prodId) {
        const p = categorias.find(c => c.id == catId).productos.find(x => x.id == prodId);
        s.value = catId; document.getElementById('prodNombre').value = p.nombre; document.getElementById('prodPrecio').value = p.precio;
        document.getElementById('prodImg').value = p.img; document.getElementById('prodDisponible').checked = p.disponible;
    } else {
        document.getElementById('prodNombre').value = ''; document.getElementById('prodPrecio').value = ''; document.getElementById('prodImg').value = '';
    }
}
async function guardarProducto() {
    const id = document.getElementById('prodId').value, catId = document.getElementById('prodCatId').value, nombre = document.getElementById('prodNombre').value, precio = document.getElementById('prodPrecio').value, img = document.getElementById('prodImg').value, disp = document.getElementById('prodDisponible').checked;
    if(!nombre) return;
    const payload = { category_id: catId, nombre, precio, img, disponible: disp };
    const { error } = id ? await supabaseClient.from('productos').update(payload).eq('id', id) : await supabaseClient.from('productos').insert(payload);
    if(!error) { modalProductoInst.hide(); cargarProductosAdmin(); mostrarToast("Guardado"); }
}
async function eliminarProducto(id) { if(confirm("¿Eliminar?")) { await supabaseClient.from('productos').delete().eq('id', id); cargarProductosAdmin(); } }
