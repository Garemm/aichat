// Shared navigation link definitions used by Sidebar and PermissionRoute.
// permKey maps to the boolean column in the permissions_types table.
const ALL_LINKS = [
  { to: 'dashboard',     label: 'Dashboard',          icon: 'dashboard',     permKey: 'dashboard'          },
  { to: 'orders',        label: 'Pedidos',             icon: 'orders',        permKey: 'pedidos'            },
  { to: 'products',      label: 'Productos',           icon: 'products',      permKey: 'productos'          },
  { to: 'categories',    label: 'Categorías',          icon: 'categories',    permKey: 'categorias'         },
  { to: 'import',        label: 'Importar Productos',  icon: 'upload',        permKey: 'importar_productos' },
  { to: 'services',      label: 'Servicios',           icon: 'services',      permKey: 'servicios'          },
  { to: 'promotions',    label: 'Promociones',         icon: 'promotions',    permKey: 'promociones'        },
  { to: 'hours',         label: 'Horarios',            icon: 'hours',         permKey: 'horarios'           },
  { to: 'mi-haychat',    label: 'Mi hayChat',          icon: 'qrcode',        permKey: 'mi_haychat'         },
  { to: 'business',      label: 'Mi Negocio',          icon: 'business',      permKey: 'mi_negocio'         },
  { to: 'subscriptions', label: 'Suscripciones',       icon: 'subscriptions', permKey: 'suscripciones'      },
];

export default ALL_LINKS;
