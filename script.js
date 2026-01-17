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
let accionPendiente = null; 
let printWindow = null; 

// Instancias de Bootstrap
let toastBootstrap, modalCategoriaInst, modalProductoInst, modalDatosInvitadoInst, modalConfirmacionInst, modalExitoOrdenInst, modalDetalleInst;

function formatearRD(monto) {
  return 'RD$ ' + monto.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// ================= INICIALIZACIÓN (DOM READY) =================
document.addEventListener('DOMContentLoaded', async () => {
  inicializarComponentesBootstrap();
  
  // 1. Registrar Visita (Invisible para el usuario, pero cuenta en base de datos)
  await registrarVisita();

  // 2. Verificar Sesión
  if (usuarioActual) {
    const { data } = await supabaseClient.from('usuarios').select('*').eq('username', usuarioActual).single();
    if (data) {
      currentUser = data;
      // Solo si es ADMIN, cargamos y mostramos el contador
      if(currentUser.role === 'admin') {
          actualizarContadorVisualAdmin();
      }
    } else {
      localStorage.removeItem('usuarioActual');
      usuarioActual = null;
    }
  }
  
  // 3. Cargar Interfaz
  await cargarCategoriaMenu(); 
  actualizarInterfaz();
  await irASeccion('portada');
  
  // 4. Quitar Loader
  setTimeout(() => {
      const loader = document.getElementById('loader-overlay');
      if(loader) { loader.style.opacity = '0'; setTimeout(() => loader.remove(), 500); }
  }, 800);
});

function inicializarComponentesBootstrap() {
  toastBootstrap = new bootstrap.Toast(document.getElementById('liveToast'));
  if(document.getElementById('modalCategoria')) modalCategoriaInst = new bootstrap.Modal(document.getElementById('modalCategoria'));
  if(document.getElementById('modalProducto')) modalProductoInst = new bootstrap.Modal(document.getElementById('modalProducto'));
  if(document.getElementById('modalDatosInvitado')) modalDatosInvitadoInst = new bootstrap.Modal(document.getElementById('modalDatosInvitado'), {backdrop: 'static', keyboard: false});
  if(document.getElementById('modalConfirmacion')) modalConfirmacionInst = new bootstrap.Modal(document.getElementById('modalConfirmacion'), {backdrop: 'static', keyboard: false});
  if(document.getElementById('modalExitoOrden')) modalExitoOrdenInst = new bootstrap.Modal(document.getElementById('modalExitoOrden'));
  if(document.getElementById('modalProductoDetalle')) modalDetalleInst = new bootstrap.Modal(document.getElementById('modalProductoDetalle'));
}

// ================= LÓGICA DE VISITAS =================
async function registrarVisita() {
    try {
        await supabaseClient.from('visitas').insert({});
    } catch (e) { console.error("Error registrando visita", e); }
}

async function actualizarContadorVisualAdmin() {
    const container = document.getElementById('footerVisitasContainer');
    const label = document.getElementById('contador-visitas');
    
    if(!container || !label) return;

    // Mostrar el contenedor (estaba d-none) solo para el admin
    container.classList.remove('d-none');

    try {
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        const hoyISO = hoy.toISOString();

        const { count, error } = await supabaseClient
            .from('visitas')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', hoyISO);
        
        label.innerText = (error || count === null) ? "0" : count.toLocaleString();
    } catch (e) {
        label.innerText = "?";
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
      // Limpiar selección de menú si volvemos a portada
      document.querySelectorAll('.nav-link').forEach(btn => btn.classList.remove('active-cat'));
  }
  else if (seccion === 'carrito') { cargarCarrito(); } 
  else if (seccion === 'adminPanel') {
    if (currentUser?.role !== 'admin') { mostrarToast('🚫 Acceso denegado.'); irASeccion('portada'); return; }
    await cargarCategoriasAdmin();
    await cargarPedidosAdmin();
    await actualizarBadgeColaAdmin();
  }
  
  window.scrollTo({top: 0, behavior: 'smooth'});
  const navBar = document.getElementById('navbarNav');
  if (navBar && navBar.classList.contains('show')) bootstrap.Collapse.getInstance(navBar).hide();
}

function actualizarInterfaz() {
  const authBtn = document.getElementById('authButtonsContainer');
  const adminBtn = document.getElementById('btnAdminNav');
  const userDrop = document.getElementById('userDropdownContainer');
  
  if (usuarioActual && currentUser) {
    authBtn.classList.add('d-none');
    document.getElementById('userNameNav').innerText = currentUser.nombre;
    if (currentUser.role === 'admin') { 
        adminBtn.classList.remove('d-none'); 
        userDrop.classList.add('d-none'); 
        actualizarContadorVisualAdmin();
    } 
    else { 
        adminBtn.classList.add('d-none'); 
        userDrop.classList.remove('d-none'); 
    }
  } else {
    authBtn.classList.remove('d-none'); adminBtn.classList.add('d-none'); userDrop.classList.add('d-none');
  }
  actualizarContadorCarrito();
}

function actualizarContadorCarrito() {
  const c = getCarrito();
  const total = c.reduce((s, i) => s + i.cantidad, 0);
  document.querySelectorAll('.cartCountNav').forEach(b => {
      b.innerText = total;
      if(total > 0) { b.classList.remove('d-none'); b.classList.add('animate-pulse'); setTimeout(() => b.classList.remove('animate-pulse'), 500); }
      else b.classList.add('d-none');
  });
}

function mostrarToast(msg) { document.getElementById('toastBody').innerText = msg; toastBootstrap.show(); }

// ================= DATOS =================
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
  const { data } = await supabaseClient.from('pedidos').select('*').order('created_at', { ascending: true }); 
  return data ? data.map(p => { 
      const f = new Date(p.created_at);
      p.fechaStr = f.toLocaleDateString('es-DO');
      p.horaStr = f.toLocaleTimeString('es-DO', {hour: '2-digit', minute:'2-digit'});
      return p; 
  }) : [];
}

// ================= AUTH =================
async function registrarUsuario() {
  const inputs = ['regNombre', 'regApellido', 'regDireccion', 'regTelefono', 'regUser', 'regPass', 'regPassConfirm'];
  const val = {};
  inputs.forEach(id => val[id] = document.getElementById(id).value.trim());

  if (!val.regNombre || !val.regUser || !val.regPass) return mostrarToast('Faltan datos.');
  if (val.regPass !== val.regPassConfirm) return mostrarToast('Las contraseñas no coinciden.');

  const { error } = await supabaseClient.from('usuarios').insert({
    username: val.regUser, pass: val.regPass, nombre: val.regNombre, apellido: val.regApellido, direccion: val.regDireccion, telefono: val.regTelefono, role: 'user'
  });

  if (error) return mostrarToast('Error al registrar.');
  mostrarToast('¡Cuenta creada!'); irASeccion('login');
}

async function iniciarSesion() {
  const u = document.getElementById('loginUser').value.trim();
  const p = document.getElementById('loginPass').value.trim();
  const { data, error } = await supabaseClient.from('usuarios').select('*').eq('username', u).single();

  if (error || !data || data.pass !== p) return mostrarToast('Credenciales incorrectas.');

  currentUser = data; usuarioActual = u; localStorage.setItem('usuarioActual', u);
  actualizarInterfaz(); mostrarToast(`¡Hola, ${currentUser.nombre}!`); irASeccion('portada');
}

function cerrarSesion() {
  usuarioActual = null; currentUser = null; localStorage.removeItem('usuarioActual');
  actualizarInterfaz(); irASeccion('portada');
  const counter = document.getElementById('footerVisitasContainer');
  if(counter) counter.classList.add('d-none');
}

// ================= TIENDA =================
async function cargarCategorias() {
  categorias = await loadCategories();
  const c = document.getElementById('listaCategorias'); c.innerHTML = '';
  if (categorias.length === 0) { c.innerHTML = '<div class="text-center py-5 text-muted">Cargando...</div>'; return; }

  categorias.forEach(cat => {
    c.innerHTML += `
      <div class="col-6 col-md-3 mb-3">
          <div class="card card-categoria h-100" onclick="verProductos('${cat.nombre}')">
              <div class="ratio-4x3"><img src="${cat.img}" alt="${cat.nombre}"></div>
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
  const m = document.getElementById('categoriaMenu'); if(!m) return;
  m.innerHTML = ''; 
  // Generamos botones con ID único para poder resaltarlos
  categorias.forEach(cat => {
      m.innerHTML += `
      <li class="nav-item">
        <a class="nav-link text-white fw-bold" id="menu-btn-${cat.id}" href="#" onclick="verProductos('${cat.nombre}')">${cat.nombre}</a>
      </li>`;
  });
}

function verProductos(nom) {
  const cat = categorias.find(c => c.nombre === nom);
  if (cat) {
      mostrarProductosEnSeccion(cat.nombre, cat.productos);
      
      // LOGICA PARA RESALTAR EL BOTÓN ACTIVO
      document.querySelectorAll('.nav-link').forEach(btn => btn.classList.remove('active-cat'));
      const btnActivo = document.getElementById(`menu-btn-${cat.id}`);
      if(btnActivo) btnActivo.classList.add('active-cat');
  }
}

function mostrarProductosEnSeccion(tit, prods) {
  document.getElementById('tituloCategoria').innerText = tit;
  const c = document.getElementById('listaProductos'); c.innerHTML = '';
  const cat = categorias.find(x => x.nombre === tit);

  if (prods.length === 0) { c.innerHTML = '<div class="col-12 text-center text-muted py-5">Sin productos.</div>'; } 
  else {
    prods.forEach(p => {
      let badge = p.disponible ? '' : '<span class="position-absolute top-0 end-0 badge bg-danger m-2 shadow-sm">Agotado</span>';
      c.innerHTML += `
          <div class="col-6 col-md-3 mb-3">
              <div class="card card-producto h-100" onclick="abrirDetalleProducto(${cat.id}, ${p.id})">
                  ${badge}
                  <div class="ratio-4x3"><img src="${p.img}"></div>
                  <div class="card-body text-center p-2 p-md-3 d-flex flex-column">
                      <h6 class="card-title fw-bold text-truncate">${p.nombre}</h6>
                      <div class="mt-auto pt-1"><span class="badge-precio">${formatearRD(p.precio)}</span></div>
                  </div>
              </div>
          </div>`;
    });
  }
  irASeccion('productos');
}

function abrirDetalleProducto(cId, pId) {
  if(!modalDetalleInst) modalDetalleInst = new bootstrap.Modal(document.getElementById('modalProductoDetalle'));
  const cat = categorias.find(c => c.id === cId);
  const prod = cat?.productos.find(p => p.id === pId);
  if (!prod) return;
  
  document.getElementById('detalleImg').src = prod.img;
  document.getElementById('detalleCat').innerText = cat.nombre;
  document.getElementById('detalleNombre').innerText = prod.nombre;
  document.getElementById('detallePrecio').innerText = formatearRD(prod.precio);
  document.getElementById('detalleDesc').innerText = prod.descripcion || "Personalizado a tu gusto.";
  
  const btn = document.getElementById('btnAgregarDetalle');
  if(!prod.disponible) {
      document.getElementById('detalleEstado').innerHTML = '<span class="badge bg-danger">Agotado</span>';
      btn.disabled = true; btn.innerText = "No disponible"; btn.onclick = null;
  } else {
      document.getElementById('detalleEstado').innerHTML = '<span class="badge bg-success bg-opacity-10 text-success border border-success">Disponible</span>';
      btn.disabled = false; btn.innerText = 'Agregar al Carrito';
      btn.onclick = () => { agregarAlCarrito(prod); modalDetalleInst.hide(); };
  }
  modalDetalleInst.show();
}

function buscarProductos() {
  const q = document.getElementById('searchInput').value.trim().toLowerCase();
  const cc = document.getElementById('contenedorCategorias');
  const cr = document.getElementById('contenedorResultados');
  const lr = document.getElementById('listaResultados');

  if (q === '') { cc.classList.remove('d-none'); cr.classList.add('d-none'); return; }

  cc.classList.add('d-none'); cr.classList.remove('d-none'); lr.innerHTML = '';
  let res = [];
  categorias.forEach(c => c.productos.forEach(p => { if (p.nombre.toLowerCase().includes(q)) res.push({p, catId: c.id}); }));

  if(res.length === 0) lr.innerHTML = '<div class="col-12 text-center py-5 text-muted">Sin resultados.</div>';
  else {
      res.forEach(r => {
          lr.innerHTML += `<div class="col-6 col-md-3 mb-3"><div class="card card-producto h-100" onclick="abrirDetalleProducto(${r.catId}, ${r.p.id})">
              <div class="ratio-4x3"><img src="${r.p.img}"></div>
              <div class="card-body text-center p-2"><h6 class="fw-bold">${r.p.nombre}</h6><span class="badge-precio small">${formatearRD(r.p.precio)}</span></div>
          </div></div>`;
      });
  }
}
function limpiarBusqueda() { document.getElementById('searchInput').value = ''; buscarProductos(); }

// ================= CARRITO =================
function getCarrito() { return JSON.parse(localStorage.getItem(usuarioActual ? `carrito_${usuarioActual}` : `carrito_invitado`)) || []; }
function setCarrito(c) { localStorage.setItem(usuarioActual ? `carrito_${usuarioActual}` : `carrito_invitado`, JSON.stringify(c)); }

function agregarAlCarrito(p) {
  const c = getCarrito();
  const i = c.find(x => x.nombre === p.nombre);
  if (i) i.cantidad++; else c.push({ nombre: p.nombre, precio: p.precio, img: p.img, cantidad: 1 });
  setCarrito(c); actualizarContadorCarrito(); mostrarToast('Agregado al carrito 🛒');
}

function cargarCarrito() {
  const c = getCarrito();
  const tb = document.getElementById('listaCarrito'); tb.innerHTML = '';
  if (c.length === 0) {
    tb.innerHTML = '<tr><td colspan="5" class="text-center py-5">Carrito vacío</td></tr>';
    document.getElementById('totalCarrito').innerText = 'RD$0.00'; return;
  }
  let tot = 0;
  c.forEach((i, idx) => {
    tot += i.precio * i.cantidad;
    tb.innerHTML += `<tr>
        <td><div class="d-flex align-items-center"><img src="${i.img}" style="width:40px;height:40px;object-fit:cover;border-radius:5px;margin-right:10px;"><span class="fw-bold small">${i.nombre}</span></div></td>
        <td class="text-center small">${formatearRD(i.precio)}</td>
        <td class="text-center"><div class="input-group input-group-sm justify-content-center" style="width:80px;margin:auto;"><button class="btn btn-outline-secondary" onclick="modCant(${idx},-1)">-</button><span class="input-group-text bg-white">${i.cantidad}</span><button class="btn btn-outline-secondary" onclick="modCant(${idx},1)">+</button></div></td>
        <td class="text-center fw-bold text-primary small">${formatearRD(i.precio*i.cantidad)}</td>
        <td class="text-center"><button class="btn btn-sm text-danger" onclick="elimItem(${idx})"><i class="bi bi-trash"></i></button></td>
    </tr>`;
  });
  document.getElementById('totalCarrito').innerText = formatearRD(tot);
}
function modCant(i, d) { const c = getCarrito(); c[i].cantidad += d; if(c[i].cantidad<=0) c.splice(i,1); setCarrito(c); cargarCarrito(); actualizarContadorCarrito(); }
function elimItem(i) { const c = getCarrito(); c.splice(i, 1); setCarrito(c); cargarCarrito(); actualizarContadorCarrito(); }
function vaciarCarrito() { localStorage.removeItem(usuarioActual ? `carrito_${usuarioActual}` : `carrito_invitado`); cargarCarrito(); actualizarContadorCarrito(); }

// ================= PROCESO DE ORDEN =================
function solicitarConfirmacion(tipo) {
    if(getCarrito().length === 0) return mostrarToast('Carrito vacío.');
    accionPendiente = tipo;
    document.getElementById('textoConfirmacion').innerText = (tipo === 'imprimir_descargar') ? "¿Generar cotización PDF?" : "Confirmar pedido para WhatsApp.";
    document.getElementById('btnConfirmarAccion').onclick = async () => { modalConfirmacionInst.hide(); await prepararDatos(); };
    modalConfirmacionInst.show();
}

async function prepararDatos() {
    if(usuarioActual && currentUser) {
        if (accionPendiente === 'imprimir_descargar') abrirVentanaImpresion();
        await procesarPedido(currentUser);
    } else { modalDatosInvitadoInst.show(); }
}

function abrirVentanaImpresion() {
    printWindow = window.open('', '_blank');
    if (printWindow) printWindow.document.write('<div style="text-align:center;padding:50px;font-family:sans-serif;">Generando documento...</div>');
}

async function confirmarDatosInvitado() {
  const d = { nombre: document.getElementById('invNombre').value, apellido: document.getElementById('invApellido').value, telefono: document.getElementById('invTelefono').value };
  if (!d.nombre || !d.telefono) return mostrarToast('Datos incompletos.');
  modalDatosInvitadoInst.hide();
  if (accionPendiente === 'imprimir_descargar') abrirVentanaImpresion();
  await procesarPedido(d);
}

async function procesarPedido(cliente) {
  const items = getCarrito();
  const total = items.reduce((s, i) => s + i.precio * i.cantidad, 0);
  const pedido = { cliente: { nombre: cliente.nombre, apellido: cliente.apellido, telefono: cliente.telefono }, items, total, estado: 'pendiente' };

  const { data: newPedido, error } = await supabaseClient.from('pedidos').insert(pedido).select().single();
  
  if (error || !newPedido) { 
      mostrarToast('Error al procesar.'); 
      if(printWindow) printWindow.close(); 
      return; 
  }
  
  const f = new Date(newPedido.created_at);
  newPedido.fechaStr = f.toLocaleDateString('es-DO');
  newPedido.horaStr = f.toLocaleTimeString('es-DO', {hour: '2-digit', minute:'2-digit'});

  const { count } = await supabaseClient.from('pedidos').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente');
  const turno = count; 

  document.getElementById('numeroTurnoExito').innerText = `#${turno}`;
  
  const btnMan = document.getElementById('btnWhatsappManual');
  const boxMan = document.getElementById('containerBtnWhatsappManual');
  boxMan.classList.add('d-none');

  if (accionPendiente === 'imprimir_descargar' && printWindow) {
      imprimirFactura(newPedido, turno, printWindow);
  } else if (accionPendiente === 'whatsapp') {
      const url = generarLinkWhatsApp(newPedido, turno);
      btnMan.href = url;
      boxMan.classList.remove('d-none');
      const w = window.open(url, '_blank');
      if(!w || w.closed || typeof w.closed=='undefined') mostrarToast('Usa el botón verde para abrir WhatsApp.');
  }

  modalExitoOrdenInst.show();
  vaciarCarrito();
  accionPendiente = null; printWindow = null;
}

function generarLinkWhatsApp(p, turno) {
  let msg = `👋 Hola *Mariposas Cuties*, pedido nuevo:\n\n`;
  msg += `🔢 *Turno:* #${turno}\n`;
  msg += `👤 *Cliente:* ${p.cliente.nombre} ${p.cliente.apellido}\n`;
  msg += `📱 *Tel:* ${p.cliente.telefono}\n\n`;
  msg += `🛒 *DETALLE:*\n`;
  p.items.forEach(i => msg += `- ${i.cantidad}x ${i.nombre} (${formatearRD(i.precio*i.cantidad)})\n`);
  msg += `\n💰 *TOTAL: ${formatearRD(p.total)}*`;
  return `https://wa.me/18096659100?text=${encodeURIComponent(msg)}`;
}

// ================= FACTURA PDF PROFESIONAL CON FOTOS =================
function imprimirFactura(p, turno, win) {
    if (!win) return;

    // 1. Generar filas de la tabla con IMAGEN
    let rows = '';
    p.items.forEach(i => {
        rows += `
        <tr class="item-row">
            <td style="text-align:center;">
                <img src="${i.img}" alt="prod" style="width:50px; height:50px; object-fit:cover; border-radius:4px; border:1px solid #eee;">
            </td>
            <td style="vertical-align:middle; font-weight:500;">
                ${i.nombre}
                <div style="font-size:11px; color:#777;">Ref: ${i.nombre.substring(0,3).toUpperCase()}-${Math.floor(Math.random()*1000)}</div>
            </td>
            <td style="text-align:center; vertical-align:middle;">${i.cantidad}</td>
            <td style="text-align:right; vertical-align:middle;">${formatearRD(i.precio)}</td>
            <td style="text-align:right; vertical-align:middle; font-weight:bold;">${formatearRD(i.precio * i.cantidad)}</td>
        </tr>`;
    });

    // 2. Definir estado y turno
    let bloqueEstado = (p.estado === 'pendiente' || !p.estado) 
        ? `<div class="status-box pending">
             <span style="font-size:12px; text-transform:uppercase; letter-spacing:1px;">Turno de Entrega</span><br>
             <span style="font-size:24px; font-weight:bold; color:#d32f2f;">#${turno || '?'}</span>
           </div>`
        : `<div class="status-box success">
             <span style="font-size:16px; font-weight:bold; color:#2e7d32;">ENTREGADO</span>
           </div>`;

    // 3. Escribir el HTML Profesional
    win.document.open();
    win.document.write(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <title>Cotización #${p.id} - Mariposas Cuties</title>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;700&display=swap');
            
            body { font-family: 'Roboto', sans-serif; color: #333; margin: 0; padding: 40px; font-size: 14px; background: white; }
            
            /* Encabezado */
            .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #6a1b9a; padding-bottom: 20px; margin-bottom: 30px; }
            .logo-area { display: flex; align-items: center; gap: 15px; }
            .logo-area img { height: 70px; width: auto; }
            .company-info { font-size: 12px; color: #555; text-align: right; }
            .company-info h2 { margin: 0; color: #6a1b9a; font-size: 22px; text-transform: uppercase; }
            
            /* Info Cliente y Pedido */
            .info-grid { display: flex; justify-content: space-between; margin-bottom: 40px; background: #f9f9f9; padding: 20px; border-radius: 8px; border: 1px solid #eee; }
            .client-info h3, .order-info h3 { font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 1px; margin-top: 0; margin-bottom: 10px; }
            .data { font-size: 15px; font-weight: 600; color: #000; line-height: 1.4; }
            
            /* Caja de Estado/Turno */
            .status-box { text-align: center; border: 2px dashed #ccc; padding: 10px 20px; border-radius: 8px; background: #fff; min-width: 120px; }
            
            /* Tabla */
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            th { background-color: #6a1b9a; color: white; text-transform: uppercase; font-size: 11px; letter-spacing: 1px; padding: 12px; text-align: left; }
            td { padding: 12px; border-bottom: 1px solid #eee; }
            .item-row:nth-child(even) { background-color: #fbfbfb; }
            
            /* Totales */
            .total-section { display: flex; justify-content: flex-end; }
            .total-box { width: 250px; }
            .total-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
            .total-row.final { border-top: 2px solid #6a1b9a; border-bottom: none; font-size: 18px; font-weight: bold; color: #6a1b9a; margin-top: 10px; padding-top: 10px; }
            
            /* Footer */
            .footer { margin-top: 50px; text-align: center; font-size: 11px; color: #777; border-top: 1px solid #ddd; padding-top: 20px; }
            
            /* Botones (No salen en impresión) */
            .no-print { text-align: center; margin-bottom: 20px; padding: 10px; background: #f0f0f0; border-radius: 8px; }
            .btn { background: #6a1b9a; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-weight: bold; margin: 0 5px; }
            .btn-close { background: #555; }
            
            @media print {
                .no-print { display: none; }
                body { padding: 0; }
                /* Forza la impresión de colores de fondo (importante para la barra morada) */
                -webkit-print-color-adjust: exact; 
                print-color-adjust: exact;
            }
        </style>
    </head>
    <body>
    
        <div class="no-print">
            <button onclick="window.print()" class="btn">🖨️ Imprimir / Guardar PDF</button>
            <button onclick="window.close()" class="btn btn-close">Cerrar</button>
        </div>

        <div class="header">
            <div class="logo-area">
                <img src="Logo.PNG" alt="Logo">
                <div>
                    <h2 style="color:#6a1b9a; margin:0;">Mariposas Cuties</h2>
                    <small>Creando Para ti..<br>
                    <strong>RNC: 05500440051</strong><br>
                    C/Salcedo-Tenares, Entrada Los Platanitos, República Dominicana<br>
                     <strong>EN PERSONALIZADOS SOMOS TU MEJOR OPCIÓN</strong>
                    </small>
                </div>
            </div>
            <div class="company-info">
                <h2>COTIZACIÓN</h2>
                <p>Fecha: ${p.fechaStr || new Date().toLocaleDateString()}<br>
                Hora: ${p.horaStr || new Date().toLocaleTimeString()}<br>
                ID Orden: <strong>#${p.id}</strong></p>
            </div>
        </div>

        <div class="info-grid">
            <div class="client-info">
                <h3>Facturado a:</h3>
                <div class="data">${p.cliente.nombre} ${p.cliente.apellido}</div>
                <div style="margin-top:5px;">📱 ${p.cliente.telefono}</div>
            </div>
            ${bloqueEstado}
        </div>

        <table>
            <thead>
                <tr>
                    <th style="text-align:center; width: 70px;">Imagen</th>
                    <th>Descripción</th>
                    <th style="text-align:center; width: 60px;">Cant.</th>
                    <th style="text-align:right; width: 100px;">Precio</th>
                    <th style="text-align:right; width: 110px;">Total</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>

        <div class="total-section">
            <div class="total-box">
                <div class="total-row">
                    <span>Subtotal:</span>
                    <span>${formatearRD(p.total)}</span>
                </div>
                <div class="total-row">
                    <span>ITBIS (0%):</span>
                    <span>RD$ 0.00</span>
                </div>
                <div class="total-row final">
                    <span>TOTAL:</span>
                    <span>${formatearRD(p.total)}</span>
                </div>
            </div>
        </div>

        <div class="footer">
          <p style="font-size: 22px; margin-bottom: 10px;">
          <strong>¡Gracias por tu preferencia! ❤️</strong> 
          </p>
    
         <p style="font-size: 14px;">
         Contactos: (809) 665-9100 | (809)-227-3753 | Instagram: @mariposas_cuties.rd
         </p>
       </div>

        <script>
            // Intentar imprimir automáticamente cuando carguen las imágenes
            window.onload = function() {
                setTimeout(function() {
                   // window.print(); // Descomenta si quieres que se abra solo
                }, 500);
            }
        </script>
    </body>
    </html>`);
    win.document.close();
}

// ================= ADMIN =================
async function actualizarBadgeColaAdmin() {
  const { count } = await supabaseClient.from('pedidos').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente');
  if(document.getElementById('badgeColaAdmin')) document.getElementById('badgeColaAdmin').innerText = count || 0;
}

async function confirmarBorrarTodo() {
    if(confirm('⚠️ ¡PELIGRO! ¿Borrar TODOS los pedidos?')) {
        const { error } = await supabaseClient.from('pedidos').delete().gt('id', 0);
        if(!error) { cargarPedidosAdmin(); actualizarBadgeColaAdmin(); mostrarToast('Historial vaciado.'); }
    }
}

async function borrarPedidoUnico(id) {
    if(confirm('¿Eliminar este pedido permanentemente?')) {
        const { error } = await supabaseClient.from('pedidos').delete().eq('id', id);
        if(!error) { 
            cargarPedidosAdmin(); 
            actualizarBadgeColaAdmin(); 
            mostrarToast('Pedido eliminado.'); 
        } else {
            mostrarToast('Error al eliminar.');
        }
    }
}

function buscarYVerDetalle(id, turno) {
    const p = historialPedidos.find(x => x.id === id);
    if(p) {
        const win = window.open('', '_blank');
        if(win) {
            win.document.write('<div style="text-align:center;padding:50px;">Cargando factura...</div>');
            imprimirFactura(p, turno, win);
        }
    }
}

async function cargarPedidosAdmin() {
  historialPedidos = await loadPedidos();
  const container = document.getElementById('listaPedidosAdmin'); if(!container) return;
  container.innerHTML = '';
  
  if(historialPedidos.length === 0) { container.innerHTML = '<div class="col-12 text-center text-muted">No hay pedidos.</div>'; return; }

  const pendientes = historialPedidos.filter(p => p.estado === 'pendiente'); 
  const completados = historialPedidos.filter(p => p.estado !== 'pendiente').sort((a,b) => b.id - a.id);

  let turnoVisual = 1;

  pendientes.forEach(p => {
      container.innerHTML += crearCardPedidoAdmin(p, turnoVisual++, true, pendientes[0].id);
  });

  if(completados.length > 0) {
      container.innerHTML += '<div class="col-12 mt-4 mb-2"><h6 class="border-bottom pb-2 text-muted">Historial Completados</h6></div>';
      completados.forEach(p => {
          container.innerHTML += crearCardPedidoAdmin(p, '-', false, null);
      });
  }
}

function crearCardPedidoAdmin(p, turno, esPendiente, primerIdPendiente) {
    const color = esPendiente ? 'border-warning border-start border-5' : 'border-success border-start border-5 opacity-75';
    const badge = esPendiente ? `<span class="badge bg-warning text-dark">Turno #${turno}</span>` : '<span class="badge bg-success">Completado</span>';
    
    let btnCompletar = '';
    if(esPendiente) {
        btnCompletar = `<button class="btn btn-sm btn-success flex-grow-1" onclick="marcarPedidoCompletado(${p.id}, ${primerIdPendiente})">✅ Completar</button>`;
    }

    // BOTÓN DE BORRAR AL FINAL
    return `
    <div class="col-md-6 col-lg-4">
        <div class="card shadow-sm mb-3 ${color}">
            <div class="card-body">
                <div class="d-flex justify-content-between mb-2 align-items-center">
                    <span class="fw-bold text-muted small">ID: ${p.id}</span>
                    ${badge}
                </div>
                <h5 class="card-title text-primary fw-bold text-truncate">${p.cliente.nombre} ${p.cliente.apellido}</h5>
                <p class="mb-1 text-muted small"><i class="bi bi-whatsapp me-1"></i>${p.cliente.telefono}</p>
                <p class="mb-1 text-muted small">${p.fechaStr} - ${p.horaStr}</p>
                <h6 class="mt-2 fw-bold text-end">Total: ${formatearRD(p.total)}</h6>
                <hr>
                
                <div class="d-flex gap-2 mb-2">
                    <button class="btn btn-sm btn-outline-dark flex-grow-1" onclick='buscarYVerDetalle(${p.id}, "${turno}")'><i class="bi bi-printer"></i> Factura</button>
                    ${btnCompletar}
                </div>

                <button class="btn btn-sm btn-outline-danger w-100" onclick="borrarPedidoUnico(${p.id})">
                    <i class="bi bi-trash3-fill me-2"></i> Eliminar Pedido
                </button>

            </div>
        </div>
    </div>`;
}

async function marcarPedidoCompletado(id, idDeberiaSer) {
    if (id !== idDeberiaSer) {
        alert(`🚫 ¡ALTO!\n\nDebes completar los pedidos en orden de llegada.\nEl pedido que toca despachar es el ID #${idDeberiaSer}.`);
        return;
    }
    if(confirm('¿Pedido entregado? Pasará al historial.')) {
        await supabaseClient.from('pedidos').update({estado: 'completado'}).eq('id', id);
        cargarPedidosAdmin(); actualizarBadgeColaAdmin(); mostrarToast("Pedido completado.");
    }
}

// ================= CRUD ADMIN (CAT/PROD) =================
// Función GLOBAL de búsqueda admin
window.filtrarProductosAdmin = function() {
    const query = document.getElementById('adminSearchInput').value.toLowerCase().trim();
    const tb = document.getElementById('tablaProductosAdmin');
    if(!tb) return;
    
    tb.innerHTML = '';
    if(categorias.length === 0) { cargarProductosAdmin(); return; }

    categorias.forEach(c => {
        c.productos.forEach(p => {
            if(query === '' || p.nombre.toLowerCase().includes(query)) {
                tb.innerHTML += `<tr>
                    <td class="align-middle"><img src="${p.img}" style="width:40px;height:40px;object-fit:cover;"></td>
                    <td class="align-middle"><div>${p.nombre}</div><small class="text-muted">${c.nombre}</small></td>
                    <td class="align-middle">${formatearRD(p.precio)}</td>
                    <td class="align-middle">${p.disponible?'<span class="badge bg-success">Ok</span>':'<span class="badge bg-danger">Agotado</span>'}</td>
                    <td class="text-end">
                        <button class="btn btn-sm btn-light border me-1" onclick="prepProd(${c.id},${p.id})" data-bs-toggle="modal" data-bs-target="#modalProducto"><i class="bi bi-pencil"></i></button>
                        <button class="btn btn-sm btn-danger" onclick="delProd(${p.id})"><i class="bi bi-trash"></i></button>
                    </td>
                </tr>`;
            }
        });
    });
}

async function cargarCategoriasAdmin() {
  categorias = await loadCategories();
  const tb = document.getElementById('tablaCategoriasAdmin'); if(!tb) return;
  tb.innerHTML = '';
  categorias.forEach(c => {
    tb.innerHTML += `<tr><td class="align-middle"><img src="${c.img}" style="width:40px;height:40px;object-fit:cover;border-radius:5px;"></td><td class="align-middle fw-bold">${c.nombre}</td><td class="text-end"><button class="btn btn-sm btn-light border me-1" onclick="prepCat(${c.id})" data-bs-toggle="modal" data-bs-target="#modalCategoria"><i class="bi bi-pencil"></i></button><button class="btn btn-sm btn-danger" onclick="delCat(${c.id})"><i class="bi bi-trash"></i></button></td></tr>`;
  });
}

async function cargarProductosAdmin() {
  categorias = await loadCategories();
  filtrarProductosAdmin();
}

function prepCat(id){ document.getElementById('catId').value=id||''; if(id){const c=categorias.find(x=>x.id==id);document.getElementById('catNombre').value=c.nombre;document.getElementById('catImg').value=c.img;}else{document.getElementById('catNombre').value='';document.getElementById('catImg').value='';}}
async function guardarCategoria(){ const id=document.getElementById('catId').value,n=document.getElementById('catNombre').value,i=document.getElementById('catImg').value; if(!n)return; const {error}=id?await supabaseClient.from('categorias').update({nombre:n,img:i}).eq('id',id):await supabaseClient.from('categorias').insert({nombre:n,img:i}); if(!error){modalCategoriaInst.hide();cargarCategoriasAdmin();} }
async function delCat(id){ if(confirm("¿Borrar?")) {await supabaseClient.from('categorias').delete().eq('id',id);cargarCategoriasAdmin();} }

function prepProd(cid,pid){ const s=document.getElementById('prodCatId');s.innerHTML='';categorias.forEach(c=>s.innerHTML+=`<option value="${c.id}">${c.nombre}</option>`); document.getElementById('prodId').value=pid||''; if(pid){const p=categorias.find(c=>c.id==cid).productos.find(x=>x.id==pid);s.value=cid;document.getElementById('prodNombre').value=p.nombre;document.getElementById('prodPrecio').value=p.precio;document.getElementById('prodImg').value=p.img;document.getElementById('prodDesc').value=p.descripcion||'';document.getElementById('prodDisponible').checked=p.disponible;}else{document.getElementById('prodNombre').value='';document.getElementById('prodPrecio').value='';document.getElementById('prodImg').value='';document.getElementById('prodDesc').value='';}}
async function guardarProducto(){ const id=document.getElementById('prodId').value,cid=document.getElementById('prodCatId').value,n=document.getElementById('prodNombre').value,p=document.getElementById('prodPrecio').value,i=document.getElementById('prodImg').value,d=document.getElementById('prodDesc').value,disp=document.getElementById('prodDisponible').checked; if(!n)return; const pay={category_id:cid,nombre:n,precio:p,img:i,descripcion:d,disponible:disp}; const {error}=id?await supabaseClient.from('productos').update(pay).eq('id',id):await supabaseClient.from('productos').insert(pay); if(!error){modalProductoInst.hide();cargarProductosAdmin();} }
async function delProd(id){ if(confirm("¿Borrar?")) {await supabaseClient.from('productos').delete().eq('id',id);cargarProductosAdmin();} }



