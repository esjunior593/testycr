const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

// Conexión a MySQL usando variables de entorno
const db = mysql.createConnection({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    port: process.env.MYSQL_PORT || 3306
});

db.connect(err => {
    if (err) {
        console.error('Error de conexión a MySQL:', err);
        return;
    }
    console.log('Conectado a MySQL');
});

// Obtener todos los comprobantes
app.get('/comprobantes', (req, res) => {
    db.query('SELECT * FROM Comprobante', (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(results);
    });
});

// Obtener un comprobante por ID
app.get('/comprobantes/:id', (req, res) => {
    const { id } = req.params;
    db.query('SELECT * FROM Comprobante WHERE id = ?', [id], (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (results.length === 0) {
            return res.status(404).json({ message: 'Comprobante no encontrado' });
        }
        res.json(results[0]);
    });
});

// Crear un comprobante
app.post('/comprobantes', (req, res) => {
    let { text } = req.body;

    if (!text) {
        return res.status(200).json({ message: "❌ No se recibió texto válido", resumen: null });
    }

    // Extraer datos del texto OCR
    const numero = text.match(/Comprobante: (\d+)/) ? text.match(/Comprobante: (\d+)/)[1] : "No encontrado";
    const nombres = text.match(/Nombre (.+)/) ? text.match(/Nombre (.+)/)[1].split("\n")[0] : "No encontrado";
    const fecha = text.match(/Fecha (\d{2} \w{3} \d{4})/) ? text.match(/Fecha (\d{2} \w{3} \d{4})/)[1] : "No encontrada";
    const monto = text.match(/Monto[^\d]+([\d,.]+)/) ? text.match(/Monto[^\d]+([\d,.]+)/)[1] : "No encontrado";

    console.log("📥 Datos extraídos:", { numero, nombres, fecha, monto });

    // Verificar si el comprobante ya existe en MySQL
    db.query('SELECT * FROM Comprobante WHERE numero = ?', [numero], (err, results) => {
        if (err) {
            console.error("❌ Error en SELECT:", err);
            return res.status(200).json({ message: "❌ Error interno del servidor", resumen: null });
        }

        if (results.length > 0) {
            console.log("🚫 Comprobante ya registrado:", numero);
            
            // Extraer datos del comprobante existente
            const comprobanteExistente = results[0];
            const resumen = `📌 **Número:** ${comprobanteExistente.numero}\n👤 **Enviado por:** ${comprobanteExistente.nombres}\n📅 **Fecha:** ${comprobanteExistente.fecha}\n💰 **Monto:** $${monto}`;

            return res.status(200).json({ 
                message: `🚫 Este comprobante ya ha sido presentado por ${comprobanteExistente.nombres}.`, 
                resumen: resumen 
            });
        }

        // Insertar en MySQL si es nuevo
        db.query('INSERT INTO Comprobante (numero, nombres, descripcion, fecha) VALUES (?, ?, ?, ?)', 
        [numero, nombres, "Pago recibido", fecha], (err) => {
            if (err) {
                console.error("❌ Error en la inserción:", err);
                return res.status(200).json({ message: "❌ Error al guardar el comprobante", resumen: null });
            }
            console.log("✅ Comprobante guardado en la base de datos");

            const resumen = `📌 **Número:** ${numero}\n👤 **Enviado por:** ${nombres}\n📅 **Fecha:** ${fecha}\n💰 **Monto:** $${monto}`;

            res.status(200).json({ message: `✅ Comprobante registrado exitosamente a nombre de ${nombres}.`, resumen });
        });
    });
});

// Actualizar un comprobante
app.put('/comprobantes/:id', (req, res) => {
    const { id } = req.params;
    const { numero, nombres, descripcion, fecha } = req.body;
    db.query('UPDATE Comprobante SET numero = ?, nombres = ?, descripcion = ?, fecha = ? WHERE id = ?',
        [numero, nombres, descripcion, fecha, id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Comprobante actualizado exitosamente' });
        });
});

// Eliminar un comprobante
app.delete('/comprobantes/:id', (req, res) => {
    const { id } = req.params;
    db.query('DELETE FROM Comprobante WHERE id = ?', [id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Comprobante eliminado exitosamente' });
    });
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});
