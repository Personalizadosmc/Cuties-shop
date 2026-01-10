// ================= CONFIGURACIÓN Y DATOS =================
const SUPABASE_URL = 'https://yhdaskochzbqktusekbt.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloZGFza29jaHpicWt0dXNla2J0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0OTE1MDAsImV4cCI6MjA4MzA2NzUwMH0.kAHQ90Wjy3R_X81e2DZCMtSjJfXp2wlTqnBFBgtJo9M';

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

let categorias = [];
let historialPedidos = [];
let currentUser = null;
let usuarioActual = localStorage.getItem('usuarioActual') || null;

let invitadoTemp = null; 
let accionPendiente = null; 
let pedidoActualParaImprimir = null; 
let printWindow = null;  // Ventana de impresión global para manejar mejor en móvil

let toastBootstrap, modalCategoriaInst, modalProductoInst, modalDatosInvitadoInst, modalDetallePedidoInst, modalConfirmacionInst, modalExitoOrdenInst, modalDetalleInst;

function formatearRD(monto) {
  return 'RD$ ' + monto.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// ================= FUNCIONES BASE =================
async function loadCategories() {
  const { data: cats, error } = await supabaseClient.from('categorias').select('*');
  if (error) { console.error(error); return []; }
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

function getCarrito() {
  const key = usuarioActual ? `carrito_${usuarioActual}` : `carrito_invitado`;
  return JSON.parse(localStorage.getItem(key)) || [];
}

function setCarrito(carritoData) {
  const key = usuarioActual ? `carrito_${usuarioActual}` : `carrito_invitado`;
  localStorage.setItem(key, JSON.stringify(carritoData));
}

function limpiarCarrito() {
  const key = usuarioActual ? `carrito_${usuarioActual}` : `carrito_invitado`;
  localStorage.removeItem(key);
}

function mostrarToast(mensaje) {
  document.getElementById('toastBody').innerText = mensaje;
  toastBootstrap.show();
}

async function irASeccion(seccion) {
  document.querySelectorAll('.seccion').forEach(s => s.classList.remove('active'));
  document.getElementById(seccion).classList.add('active');

  if (seccion === 'portada') { 
    await cargarCategorias(); 
    limpiarBusqueda(); 
  }
  else if (seccion === 'carrito') { cargarCarrito(); } 
  else if (seccion === 'adminPanel') {
    if (currentUser?.role !== 'admin') { 
      mostrarToast('Acceso restringido 🚫'); 
      irASeccion('portada'); 
      return; 
    }
    await cargarCategoriasAdmin();
    await actualizarBadgeColaAdmin();
  }
  window.scrollTo({top: 0, behavior: 'smooth'});
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
  if(total > 0) badge.classList.remove('d-none');
  else badge.classList.add('d-none');
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

  if (!nombre || !apellido || !direccion || !telefono || !usuario || !password) return mostrarToast('Completa todos los campos');
  if (password !== passwordConfirm) return mostrarToast('Las contraseñas no coinciden');

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
    if (error.code === '23505') return mostrarToast('Usuario ya existe');
    console.error(error);
    return mostrarToast('Error al registrar');
  }

  mostrarToast('Registrado correctamente 🎉');
  setTimeout(() => irASeccion('login'), 1500);
}

async function iniciarSesion() {
  const usuario = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPass').value.trim();

  const { data, error } = await supabaseClient.from('usuarios').select('*').eq('username', usuario).single();

  if (error || !data || data.pass !== password) return mostrarToast('Credenciales incorrectas');

  currentUser = data;
  usuarioActual = usuario;
  localStorage.setItem('usuarioActual', usuario);
  actualizarInterfaz();
  mostrarToast(`Bienvenido ${currentUser.nombre}`);
  irASeccion('portada');
}

function cerrarSesion() {
  usuarioActual = null;
  currentUser = null;
  invitadoTemp = null;
  localStorage.removeItem('usuarioActual');
  actualizarInterfaz();
  mostrarToast('Sesión cerrada');
  irASeccion('portada');
}

// ================= TIENDA Y DETALLES =================
async function cargarCategorias() {
  categorias = await loadCategories();
  const container = document.getElementById('listaCategorias');
  container.innerHTML = '';
  categorias.forEach(cat => {
    container.innerHTML += `
      <div class="col-md-3 mb-4">
          <div class="card category-card h-100" onclick="verProductos('${cat.nombre}')" style="cursor:pointer">
              <img src="${cat.img}" class="card-img-top w-100" alt="${cat.nombre}">
              <div class="card-body text-center p-4">
                  <h5 class="card-title fw-bold mb-0">${cat.nombre}</h5>
              </div>
          </div>
      </div>`;
  });
  await cargarCategoriaMenu();
}

async function cargarCategoriaMenu() {
  const menu = document.getElementById('categoriaMenu');
  menu.innerHTML = '';
  categorias.forEach(cat => {
    menu.innerHTML += `
      <li class="nav-item">
        <a class="nav-link" href="#" onclick="verProductos('${cat.nombre}')">${cat.nombre}</a>
      </li>`;
  });
}

function mostrarProductosEnSeccion(titulo, productos) {
  document.getElementById('tituloCategoria').innerText = titulo;
  const container = document.getElementById('listaProductos');
  container.innerHTML = '';
  
  const cat = categorias.find(c => c.nombre === titulo);

  if (productos.length === 0) {
    container.innerHTML = '<div class="col-12 text-center text-muted py-5">No hay productos.</div>';
  } else {
    productos.forEach((prod) => {
      container.innerHTML += `
          <div class="col-sm-6 col-lg-3 mb-4">
              <div class="card product-card h-100" onclick="abrirDetalleProducto(${cat.id}, ${prod.id})">
                  <img src="${prod.img}" class="card-img-top" alt="${prod.nombre}">
                  <div class="card-body text-center d-flex flex-column p-4">
                      <h6 class="card-title fw-bold text-dark mb-1">${prod.nombre}</h6>
                      <p class="card-text text-primary fw-bold fs-4 mb-2">${formatearRD(prod.precio)}</p>
                      <small class="text-muted mt-auto">Clic para ver detalles</small>
                  </div>
              </div>
          </div>`;
    });
  }
  irASeccion('productos');
}

function verProductos(nombreCategoria) {
  const categoria = categorias.find(c => c.nombre === nombreCategoria);
  if (categoria) mostrarProductosEnSeccion(categoria.nombre, categoria.productos);
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
  document.getElementById('detalleDesc').innerText = prod.descripcion || "Sin descripción detallada.";
  
  const estadoEl = document.getElementById('detalleEstado');
  const btnAgregar = document.getElementById('btnAgregarDetalle');

  if(prod.disponible === false) {
      estadoEl.className = "d-flex align-items-center fw-bold text-danger";
      estadoEl.innerHTML = '<i class="bi bi-x-circle me-2"></i> Agotado / No Disponible';
      btnAgregar.disabled = true;
      btnAgregar.innerText = "Producto Agotado";
      btnAgregar.classList.replace('btn-primary', 'btn-secondary');
      btnAgregar.onclick = null;
  } else {
      estadoEl.className = "d-flex align-items-center fw-bold text-success";
      estadoEl.innerHTML = '<i class="bi bi-check-circle me-2"></i> Disponible';
      btnAgregar.disabled = false;
      btnAgregar.innerText = "Agregar al carrito para personalizar";
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
    listaRes.innerHTML = '<div class="col-12 text-center py-5">No se encontraron productos.</div>';
  } else {
      resultados.forEach(r => {
          listaRes.innerHTML += `
              <div class="col-sm-6 col-lg-3 mb-4">
                  <div class="card product-card h-100" onclick="abrirDetalleProducto(${r.catId}, ${r.prod.id})">
                      <img src="${r.prod.img}" class="card-img-top">
                      <div class="card-body text-center d-flex flex-column p-4">
                          <h6 class="card-title fw-bold">${r.prod.nombre}</h6>
                          <p class="text-primary fw-bold fs-4">${formatearRD(r.prod.precio)}</p>
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
function agregarAlCarrito(producto) {
  const carrito = getCarrito();
  const item = carrito.find(p => p.nombre === producto.nombre);
  if (item) item.cantidad++;
  else carrito.push({ 
      nombre: producto.nombre, 
      precio: producto.precio, 
      img: producto.img, 
      descripcion: producto.descripcion || "", 
      cantidad: 1 
  });
  setCarrito(carrito);
  actualizarContadorCarrito();
  mostrarToast(`Agregado: ${producto.nombre} ✅`);
}

function cargarCarrito() {
  const carrito = getCarrito();
  const container = document.getElementById('listaCarrito'); 
  container.innerHTML = '';
  if (carrito.length === 0) {
    container.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-5">Tu carrito está vacío</td></tr>';
    document.getElementById('totalCarrito').innerText = 'RD$0.00';
    return;
  }
  let total = 0;
  carrito.forEach((item, index) => {
    total += item.precio * item.cantidad;
    let descHTML = item.descripcion ? `<br><small class='text-muted text-truncate' style="max-width:200px; display:inline-block;">${item.descripcion}</small>` : '';
    container.innerHTML += `
      <tr>
          <td>
              <div class="d-flex align-items-center">
                  <img src="${item.img}" class="rounded-3" style="width:40px;height:40px;margin-right:10px;">
                  <div>${item.nombre} ${descHTML}</div>
              </div>
          </td>
          <td class="text-center">${formatearRD(item.precio)}</td>
          <td class="text-center">
              <button class="btn btn-sm border" onclick="cambiarCantidad(${index}, -1)">-</button>
              <span class="mx-2">${item.cantidad}</span>
              <button class="btn btn-sm border" onclick="cambiarCantidad(${index}, 1)">+</button>
          </td>
          <td class="text-center fw-bold">${formatearRD(item.precio*item.cantidad)}</td>
          <td class="text-center"><button class="btn btn-sm text-danger" onclick="eliminarDelCarrito(${index})"><i class="bi bi-trash"></i></button></td>
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
  limpiarCarrito(); 
  cargarCarrito(); 
  actualizarContadorCarrito(); 
}

// ================= ORDENES Y COLA =================
function solicitarConfirmacion(tipo) {
    const carrito = getCarrito();
    if(carrito.length === 0) return mostrarToast('El carrito está vacío');
    accionPendiente = tipo;
    
    let mensaje = "";
    if(tipo === 'imprimir_descargar') mensaje = "¿Deseas imprimir o descargar la cotización como PDF?";
    else if(tipo === 'whatsapp') mensaje = "¿Seguro que deseas enviar el pedido por WhatsApp?";
    
    document.getElementById('textoConfirmacion').innerText = mensaje + " Se guardará en la cola de espera.";
    
    // Abrir ventana de impresión ANTES de ocultar el modal (crucial en móvil)
    document.getElementById('btnConfirmarAccion').onclick = async function() {
        if (accionPendiente === 'imprimir_descargar') {
            printWindow = window.open('', '_blank');
            if (!printWindow) {
                mostrarToast('⚠️ Permite las ventanas emergentes para imprimir la cotización.');
                printWindow = null;
            }
        }
        modalConfirmacionInst.hide();
        await prepararDatosParaAccion();
    };
    modalConfirmacionInst.show();
}

async function prepararDatosParaAccion() {
    if(usuarioActual && currentUser) {
        await ejecutarAccionConDatos(currentUser);
    } else {
        modalDatosInvitadoInst.show();
    }
}

async function confirmarDatosInvitado() {
  const nombre = document.getElementById('invNombre').value.trim();
  const apellido = document.getElementById('invApellido').value.trim();
  const telefono = document.getElementById('invTelefono').value.trim();

  if (!nombre || !apellido || !telefono) return mostrarToast('Completa los campos');

  invitadoTemp = { nombre, apellido, telefono };
  modalDatosInvitadoInst.hide();
  await ejecutarAccionConDatos(invitadoTemp);
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
    mostrarToast('Error al guardar pedido');
    console.error(error);
    return;
  }

  formatPedido(newPedido);
  pedidoActualParaImprimir = newPedido;

  const { count } = await supabaseClient.from('pedidos').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente');
  const turno = count;

  document.getElementById('numeroTurnoExito').innerText = `#${turno}`;
  modalExitoOrdenInst.show();

  if (accionPendiente === 'imprimir_descargar') {
      if (printWindow) {
          imprimirFactura(newPedido, turno, printWindow);
      } else {
          mostrarToast('Impresión bloqueada, pero el pedido se guardó en la cola.');
      }
  } else if (accionPendiente === 'whatsapp') {
      enviarPorWhatsApp(newPedido, turno);
  }

  limpiarCarrito();
  cargarCarrito(); // Actualiza inmediatamente la vista del carrito (incluso si está vacío)
  actualizarContadorCarrito();
  invitadoTemp = null;
  accionPendiente = null;
  printWindow = null;
}

function enviarPorWhatsApp(pedido, turno) {
  let mensaje = `Hola! Tengo un pedido de Mariposas Cuties.\nTurno: #${turno}\nCliente: ${pedido.cliente.nombre} ${pedido.cliente.apellido}\nTel: ${pedido.cliente.telefono}\n\nProductos:\n`;
  pedido.items.forEach(item => {
    mensaje += `${item.cantidad} x ${item.nombre} - ${formatearRD(item.precio * item.cantidad)}\n`;
  });
  mensaje += `\nTotal: ${formatearRD(pedido.total)}`;
  const url = `https://wa.me/18096659100?text=${encodeURIComponent(mensaje)}`;
  window.open(url, '_blank');
}

// ================= FUNCIÓN UNIFICADA DE IMPRESIÓN (actualizada con botones Cerrar rojo y Descargar PDF) =================
function imprimirFactura(pedido, turno, targetWin = null) {
    let win = targetWin || window.open('', '_blank');
    if (!win) {
        mostrarToast('⚠️ No se pudo abrir ventana de impresión. Permite pop-ups.');
        return;
    }

    let filasHTML = '';
    pedido.items.forEach(i => {
        filasHTML += `
          <tr>
              <td style="padding:10px;"><img src="${i.img}" style="width:50px; border-radius:5px;"></td>
              <td style="padding:10px;">${i.nombre}</td>
              <td style="padding:10px; text-align:center;">${i.cantidad}</td>
              <td style="padding:10px; text-align:right;">${formatearRD(i.precio)}</td>
              <td style="padding:10px; text-align:right;">${formatearRD(i.precio * i.cantidad)}</td>
          </tr>`;
    });

    let turnoDisplay = '';
    if (turno && turno !== '-' && turno !== null) {
        turnoDisplay = `#${turno}`;
    }
    const turnoHTML = turnoDisplay ? `<div style="margin-top:15px; font-size:20px; color:#6a1b9a; font-weight:bold;">Tu turno: ${turnoDisplay}</div>` : '';

    win.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Factura #${pedido.id}</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <!-- Bootstrap para que los botones se vean bonitos -->
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
      <!-- html2pdf.js para descargar como PDF -->
      <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
      <style>
        body { font-family: Arial, sans-serif; color: #333; padding: 20px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border-bottom: 1px solid #eee; }
        @media print {
          .no-print { display: none !important; }
        }
        #facturaContent { max-width: 800px; margin: 0 auto; }
      </style>
    </head>
    <body>
        <!-- Botones (no se imprimen ni se incluyen en el PDF) -->
        <div class="no-print d-flex justify-content-center gap-4 my-4">
            <button class="btn btn-danger px-5 py-2" onclick="window.close()">Cerrar Ventana</button>
            <button class="btn btn-success px-5 py-2" onclick="descargarPDF()">Descargar PDF</button>
        </div>

        <!-- Contenido de la factura (esto sí se imprime y descarga) -->
        <div id="facturaContent">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #6a1b9a; padding-bottom:20px; margin-bottom:30px;">
                <div style="text-align: left;">
                    <img src="Logo.PNG" style="height:60px; display:block; margin-bottom:10px;" alt="Logo" onerror="this.style.display='none'">
                    <h2 style="margin:0; color:#6a1b9a; line-height:1;">Mariposas Cuties</h2>
                    <div style="font-size:12px; margin-top:5px;">Salcedo-Tenares</div>
                </div>
                <div style="text-align:right;">
                    <h1 style="margin:0; color:#6a1b9a; font-size: 24px; letter-spacing: 2px;">FACTURA</h1>
                    <p style="font-size:14px; margin:5px 0 0 0; font-weight:bold; color:#555;">${pedido.fecha}</p>
                    <p style="font-size:12px; margin:2px 0 0 0; color:#888;">ID: ${pedido.id}</p>
                </div>
            </div>
            
            <div style="background:#f9f9f9; padding:20px; border-radius:10px; margin-bottom:30px;">
                <table style="width:100%;">
                    <tr>
                        <td>
                            <div style="font-size:11px; text-transform:uppercase; color:#999; margin-bottom:5px;">Facturar a:</div>
                            <div style="font-size:16px; font-weight:bold;">${pedido.cliente.nombre} ${pedido.cliente.apellido}</div>
                            <div>${pedido.cliente.telefono}</div>
                            ${turnoHTML}
                        </td>
                        <td style="text-align:right; vertical-align:bottom;">
                             <div style="font-size:14px;">Estado: <b>${pedido.estado.toUpperCase()}</b></div>
                        </td>
                    </tr>
                </table>
            </div>

            <div style="overflow-x: auto;">
                <table style="width:100%; border-collapse:collapse; margin-bottom:30px;">
                    <thead style="background:#6a1b9a; color:white;">
                        <tr>
                            <th style="padding:10px;">Img</th>
                            <th style="padding:10px; text-align:left;">Producto</th>
                            <th style="padding:10px;">Cant.</th>
                            <th style="padding:10px; text-align:right;">Precio</th>
                            <th style="padding:10px; text-align:right;">Total</th>
                        </tr>
                    </thead>
                    <tbody>${filasHTML}</tbody>
                </table>
            </div>

            <div style="text-align:right; margin-top:20px;">
                <div style="display:inline-block; text-align:right; border-top: 1px solid #ccc; padding-top:10px;">
                    <div style="font-size:18px; margin-bottom:5px;">Total a Pagar</div>
                    <div style="font-size:24px; font-weight:bold; color:#6a1b9a;">${formatearRD(pedido.total)}</div>
                </div>
            </div>
            
            <div style="margin-top:50px; text-align:center; font-size:12px; color:#999; border-top:1px dashed #ddd; padding-top:20px;">
                Gracias por preferir Mariposas Cuties.<br>
                ¡Vuelva pronto!
            </div>
        </div>

        <script>
            // Función para descargar el PDF (solo el contenido de la factura)
            function descargarPDF() {
                const element = document.getElementById('facturaContent');
                let filename = 'Factura-${pedido.id}.pdf';
                if ("${turnoDisplay}" !== '') {
                    filename = 'Factura-${pedido.id}-Turno${turnoDisplay}.pdf';
                }
                const opt = {
                    margin:       10,
                    filename:     filename,
                    image:        { type: 'jpeg', quality: 0.98 },
                    html2canvas:  { scale: 2 },
                    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
                };
                html2pdf().set(opt).from(element).save();
            }

            // Cierre automático después de imprimir
            window.onafterprint = function() { window.close(); };
            if (window.matchMedia) {
                var mediaQueryList = window.matchMedia('print');
                mediaQueryList.addListener(function(mql) {
                    if (!mql.matches) { window.close(); }
                });
            }

            // Impresión automática con delay mayor para que carguen scripts e imágenes
            setTimeout(() => {
                window.focus();
                window.print();
            }, 2500);
        </script>
    </body>
    </html>`);
    win.document.close();
}

// En la función reimprimirPedidoDesdeModal (actualizar para manejar turno correctamente)
function reimprimirPedidoDesdeModal() { 
    if(pedidoActualParaImprimir) {
        let turno = (pedidoActualParaImprimir.estado === 'pendiente') 
            ? calcularTurnoActualDePedido(pedidoActualParaImprimir.id) 
            : null;
        imprimirFactura(pedidoActualParaImprimir, turno);
    }
}


// ================= ADMIN LOGIC =================
async function actualizarBadgeColaAdmin() {
  const { count } = await supabaseClient.from('pedidos').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente');
  document.getElementById('badgeColaAdmin').innerText = count || 0;
}

async function cargarCategoriasAdmin() {
  categorias = await loadCategories();
  const container = document.getElementById('listaCategoriasAdmin'); 
  container.innerHTML = '';
  categorias.forEach((cat) => {
    container.innerHTML += `
      <tr>
          <td class="align-middle fw-bold fs-5 text-dark">${cat.nombre}</td>
          <td class="align-middle"><span class="badge bg-secondary">${cat.productos.length} items</span></td>
          <td class="text-end">
              <button class="btn btn-warning text-dark fw-bold me-2 shadow-sm" data-bs-toggle="modal" data-bs-target="#modalCategoria" onclick="prepararFormularioCategoria(${cat.id})"><i class="bi bi-pencil-fill"></i></button>
              <button class="btn btn-danger fw-bold shadow-sm" onclick="eliminarCategoria(${cat.id})"><i class="bi bi-trash-fill"></i></button>
          </td>
      </tr>`;
  });
}

async function cargarProductosAdmin() {
  categorias = await loadCategories();
  const container = document.getElementById('listaProductosAdmin'); 
  container.innerHTML = '';
  categorias.forEach((cat) => {
    cat.productos.forEach((prod) => {
      let estadoBadge = prod.disponible 
          ? '<span class="badge bg-success">Disponible</span>' 
          : '<span class="badge bg-danger">Agotado</span>';
          
      container.innerHTML += `
          <tr>
              <td><span class="badge bg-light text-dark border">${cat.nombre}</span></td>
              <td class="fw-bold">${prod.nombre}</td>
              <td>${estadoBadge}</td>
              <td class="text-primary fw-bold">${formatearRD(prod.precio)}</td>
              <td class="text-end">
                  <button class="btn btn-warning text-dark fw-bold me-2 shadow-sm" data-bs-toggle="modal" data-bs-target="#modalProducto" onclick="prepararFormularioProducto(${cat.id}, ${prod.id})"><i class="bi bi-pencil-fill"></i></button>
                  <button class="btn btn-danger fw-bold shadow-sm" onclick="eliminarProducto(${cat.id}, ${prod.id})"><i class="bi bi-trash-fill"></i></button>
              </td>
          </tr>`;
    });
  });
}

async function cargarPedidosAdmin() {
  historialPedidos = await loadPedidos();
  const containerPendientes = document.getElementById('listaPedidosPendientes'); 
  const containerCompletados = document.getElementById('listaPedidosCompletados'); 
  containerPendientes.innerHTML = ''; 
  containerCompletados.innerHTML = '';

  const pendientes = historialPedidos.filter(p => p.estado === 'pendiente').sort((a,b) => a.id - b.id);
  const completados = historialPedidos.filter(p => p.estado !== 'pendiente').sort((a,b) => b.id - a.id);

  if(pendientes.length === 0) {
      containerPendientes.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4">No hay clientes en espera.</td></tr>';
  } else {
      pendientes.forEach((pedido, index) => {
          let turnoVisual = index + 1;
          containerPendientes.innerHTML += `
            <tr class="table-warning">
                <td class="align-middle"><span class="turno-badge">#${turnoVisual}</span></td>
                <td class="align-middle">
                    <div class="fw-bold">${pedido.cliente.nombre} ${pedido.cliente.apellido}</div>
                    <small class="text-muted">${pedido.cliente.telefono}</small>
                </td>
                <td class="align-middle small">${pedido.fecha}</td>
                <td class="align-middle fw-bold">${formatearRD(pedido.total)}</td>
                <td class="text-end align-middle">
                    <button class="btn btn-sm btn-info text-white me-1" onclick='verDetallePedido(${JSON.stringify(pedido)})' title="Ver"><i class="bi bi-eye-fill"></i></button>
                    <button class="btn btn-sm btn-success fw-bold" onclick='marcarPedidoCompletado(${pedido.id})' title="Marcar como Realizado"><i class="bi bi-check-lg"></i> Listo</button>
                </td>
            </tr>`;
      });
  }

  if(completados.length === 0) {
      containerCompletados.innerHTML = '<tr><td colspan="5" class="text-center py-2">Sin historial reciente.</td></tr>';
  } else {
      completados.forEach((pedido) => {
          containerCompletados.innerHTML += `
            <tr>
                <td><small>#${pedido.id}</small></td>
                <td>${pedido.fecha}</td>
                <td>${pedido.cliente.nombre}</td>
                <td>${formatearRD(pedido.total)}</td>
                <td class="text-end">
                     <span class="badge bg-success">Completado</span>
                     <button class="btn btn-sm btn-light border" onclick='verDetallePedido(${JSON.stringify(pedido)})'><i class="bi bi-eye"></i></button>
                </td>
            </tr>`;
      });
  }
  await actualizarBadgeColaAdmin();
}

async function marcarPedidoCompletado(id) {
  if(confirm('¿Marcar este pedido como REALIZADO? Se descontará de la cola.')) {
      const { error } = await supabaseClient.from('pedidos').update({estado: 'completado'}).eq('id', id);
      if (error) {
        mostrarToast('Error al actualizar');
        console.error(error);
        return;
      }
      await cargarPedidosAdmin();
      mostrarToast('Pedido completado ✅. Cola actualizada.');
  }
}

function verDetallePedido(pedido) {
    pedidoActualParaImprimir = pedido; 
    const cuerpo = document.getElementById('cuerpoDetallePedido');
    let itemsHtml = '';
    pedido.items.forEach(i => {
        let desc = i.descripcion ? ` <i class="text-muted">(${i.descripcion})</i>` : '';
        itemsHtml += `<li>${i.cantidad} x <b>${i.nombre}</b>${desc} - ${formatearRD(i.precio*i.cantidad)}</li>`;
    });

    let turnoInfo = (pedido.estado === 'pendiente') 
      ? `<span class="badge bg-warning text-dark fs-5">Turno en Cola: #${calcularTurnoActualDePedido(pedido.id)}</span>` 
      : `<span class="badge bg-success fs-5">Completado</span>`;

    cuerpo.innerHTML = `
      <div class="row">
          <div class="col-12 text-center mb-3">${turnoInfo}</div>
          <div class="col-6">
              <h6>Cliente:</h6>
              <p>${pedido.cliente.nombre} ${pedido.cliente.apellido}<br>${pedido.cliente.telefono}</p>
          </div>
          <div class="col-6 text-end">
              <h6>Ref Pedido: ${pedido.id}</h6>
              <p>${pedido.fecha}</p>
          </div>
      </div>
      <hr>
      <h6>Productos:</h6>
      <ul>${itemsHtml}</ul>
      <h4 class="text-end text-primary mt-3">Total: ${formatearRD(pedido.total)}</h4>
    `;
    if(!modalDetallePedidoInst) modalDetallePedidoInst = new bootstrap.Modal(document.getElementById('modalDetallePedido'));
    modalDetallePedidoInst.show();
}

function calcularTurnoActualDePedido(id) {
  const pendientes = historialPedidos.filter(p => p.estado === 'pendiente').sort((a,b) => a.id - b.id);
  const index = pendientes.findIndex(p => p.id === id);
  return index !== -1 ? index + 1 : '-';
}

async function borrarHistorialCompleto() {
    if(confirm('¿Estás seguro de borrar TODO el historial? (Incluyendo la cola de espera)')) {
        const { error } = await supabaseClient.from('pedidos').delete().neq('id', 0);
        if (error) {
          mostrarToast('Error al borrar historial');
          return;
        }
        historialPedidos = [];
        await cargarPedidosAdmin();
        mostrarToast('Historial eliminado.');
    }
}

function prepararFormularioCategoria(id = -1) { 
    document.getElementById('catIndex').value = id; 
    document.getElementById('modalCategoriaTitulo').innerText = (id === -1) ? 'Nueva Categoría' : 'Editar Categoría';
    if(id !== -1){ 
      const cat = categorias.find(c => c.id === id);
      document.getElementById('catNombre').value = cat.nombre; 
      document.getElementById('catImg').value = cat.img; 
    } else { 
      document.getElementById('catNombre').value = ''; 
      document.getElementById('catImg').value = ''; 
    }
}

async function guardarCategoria(){
    const n = document.getElementById('catNombre').value.trim();
    const i = document.getElementById('catImg').value.trim();
    const idx = parseInt(document.getElementById('catIndex').value);

    if (!n || !i) return mostrarToast('Completa los campos');

    if(isNaN(idx) || idx === -1){
      const { error } = await supabaseClient.from('categorias').insert({nombre: n, img: i});
      if(error) {
        mostrarToast('Error al crear categoría');
        console.error(error);
        return;
      }
    } else {
      const { error } = await supabaseClient.from('categorias').update({nombre: n, img: i}).eq('id', idx);
      if(error) {
        mostrarToast('Error al actualizar categoría');
        console.error(error);
        return;
      }
    }
    categorias = await loadCategories();
    cargarCategoriasAdmin(); 
    modalCategoriaInst.hide();
}

async function eliminarCategoria(id){ 
  if(confirm('¿Seguro borrar categoría y todos sus productos?')) { 
    const { error } = await supabaseClient.from('categorias').delete().eq('id', id); 
    if(error) {
      mostrarToast('Error al eliminar categoría');
      console.error(error);
      return;
    }
    categorias = await loadCategories(); 
    cargarCategoriasAdmin(); 
  } 
}

function prepararFormularioProducto(catId = -1, prodId = -1){
    const sel = document.getElementById('prodCategoria'); 
    sel.innerHTML = '';
    categorias.forEach((cat)=> { 
      sel.innerHTML += `<option value="${cat.id}">${cat.nombre}</option>`;
    });
    
    document.getElementById('prodCatIndex').value = catId; 
    document.getElementById('prodIndex').value = prodId;
    
    if(catId === -1){ 
        document.getElementById('prodNombre').value = ''; 
        document.getElementById('prodDesc').value = ''; 
        document.getElementById('prodPrecio').value = ''; 
        document.getElementById('prodImg').value = '';
        document.getElementById('prodDisp').value = 'true';
    } else { 
        const cat = categorias.find(c => c.id === catId);
        const pr = cat.productos.find(p => p.id === prodId); 
        sel.value = catId; 
        document.getElementById('prodNombre').value = pr.nombre; 
        document.getElementById('prodDesc').value = pr.descripcion || ''; 
        document.getElementById('prodPrecio').value = pr.precio; 
        document.getElementById('prodImg').value = pr.img; 
        document.getElementById('prodDisp').value = pr.disponible ? 'true' : 'false';
    }
}

async function guardarProducto(){
    const c = parseInt(document.getElementById('prodCategoria').value);
    const n = document.getElementById('prodNombre').value.trim();
    const d = document.getElementById('prodDesc').value.trim();
    const pr = parseFloat(document.getElementById('prodPrecio').value);
    const img = document.getElementById('prodImg').value.trim();
    const disp = document.getElementById('prodDisp').value === 'true';
    
    if (!n || isNaN(pr) || !img) return mostrarToast('Completa los campos requeridos');

    const oldC = parseInt(document.getElementById('prodCatIndex').value);
    const oldP = parseInt(document.getElementById('prodIndex').value);
    
    if(isNaN(oldP) || oldP === -1){
      const { error } = await supabaseClient.from('productos').insert({
        category_id: c, 
        nombre: n, 
        precio: pr, 
        img, 
        descripcion: d, 
        disponible: disp
      });
      if(error) {
        mostrarToast('Error al crear producto');
        console.error(error);
        return;
      }
    } else {
      const { error } = await supabaseClient.from('productos').update({
        category_id: c, 
        nombre: n, 
        precio: pr, 
        img, 
        descripcion: d, 
        disponible: disp
      }).eq('id', oldP);
      if(error) {
        mostrarToast('Error al actualizar producto');
        console.error(error);
        return;
      }
    }
    categorias = await loadCategories(); 
    cargarProductosAdmin(); 
    modalProductoInst.hide();
}

async function eliminarProducto(catId, prodId){ 
  if(confirm('¿Borrar producto?')){
    const { error } = await supabaseClient.from('productos').delete().eq('id', prodId); 
    if(error) {
      mostrarToast('Error al eliminar producto');
      console.error(error);
      return;
    }
    categorias = await loadCategories(); 
    cargarProductosAdmin(); 
  } 
}

function buscarProductoAdmin() {
   const q = document.getElementById('adminSearchProd').value.toLowerCase().trim();
   if(!q) return cargarProductosAdmin();
   const container = document.getElementById('listaProductosAdmin'); 
   container.innerHTML = '';
   categorias.forEach((cat) => {
    cat.productos.forEach((prod) => {
      if(prod.nombre.toLowerCase().includes(q)) {
          let estado = prod.disponible ? 'Disponible' : 'Agotado';
          container.innerHTML += `
            <tr>
              <td>${cat.nombre}</td>
              <td>${prod.nombre}</td>
              <td>${estado}</td>
              <td>${formatearRD(prod.precio)}</td>
              <td class="text-end">
                <button class="btn btn-warning text-dark fw-bold me-2" onclick="prepararFormularioProducto(${cat.id}, ${prod.id})" data-bs-toggle="modal" data-bs-target="#modalProducto"><i class="bi bi-pencil-fill"></i></button>
                <button class="btn btn-danger fw-bold" onclick="eliminarProducto(${cat.id}, ${prod.id})"><i class="bi bi-trash-fill"></i></button>
              </td>
            </tr>`;
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  toastBootstrap = new bootstrap.Toast(document.getElementById('liveToast'));
  modalCategoriaInst = new bootstrap.Modal(document.getElementById('modalCategoria'));
  modalProductoInst = new bootstrap.Modal(document.getElementById('modalProducto'));
  
  // Modales críticos en móvil: no se cierran tocando fuera ni con Esc
  modalDatosInvitadoInst = new bootstrap.Modal(document.getElementById('modalDatosInvitado'), {backdrop: 'static', keyboard: false});
  modalConfirmacionInst = new bootstrap.Modal(document.getElementById('modalConfirmacion'), {backdrop: 'static', keyboard: false});
  
  modalDetallePedidoInst = new bootstrap.Modal(document.getElementById('modalDetallePedido'));
  modalExitoOrdenInst = new bootstrap.Modal(document.getElementById('modalExitoOrden'));
  
  if (usuarioActual) {
    const { data, error } = await supabaseClient.from('usuarios').select('*').eq('username', usuarioActual).single();
    if (data) {
      currentUser = data;
    } else {
      localStorage.removeItem('usuarioActual');
      usuarioActual = null;
    }
  }
  
  await cargarCategoriaMenu();
  actualizarInterfaz();
  irASeccion('portada');
});

