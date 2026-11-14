// Validación compartida por /api/reglas-produccion (POST) y /api/reglas-produccion/:id (PUT).
// Un producto sirve para una regla de una categoría si es de esa categoría o transversal
// (categoria_id NULL, ej. los acabados). Devuelve un mensaje de error, o null si está bien.
export async function validarProductoDeRegla(db, productoId, categoriaId) {
  const producto = await db.prepare('SELECT id, categoria_id FROM productos WHERE id = ?')
    .bind(productoId)
    .first();
  if (!producto) return 'El producto indicado no existe';
  if (producto.categoria_id !== null && Number(producto.categoria_id) !== Number(categoriaId)) {
    return 'El producto no pertenece a la categoría de la regla';
  }
  return null;
}
