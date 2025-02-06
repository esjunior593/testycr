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
    console.log('✅ Conectado a MySQL');
});

// Función para extraer datos del OCR según diferentes formatos de comprobantes
function extraerDatosOCR(text) {
    const comprobanteRegex = /(?:(?:Comprobante|Número de transacción|Código de transacción|Referencia|N°|No\.)[:\s]+)(\d+)/i;
    const nombresRegex = /(?:Para:|Beneficiario:|Perteneciente a:|Nombre:|Titular Cuenta:)\s*([A-Za-z\s]+)/i;
    const montoRegex = /(?:\$|VALOR[:\s]*)?([\d,.]+)/i; // Ahora detecta "VALOR 3.50"
    const fechaRegex = /(?:Fecha[:\s]+)(\d{1,2} [a-zA-Z]{3,} \d{4}|\d{2}\/\d{2}\/\d{4})/i;
    const fechaHoraRegex = /Fecha\s*-\s*(\d{4}-\d{2}-\d{2}) - Hora (\d{2}:\d{2}:\d{2})/i; // Nueva detección de fecha-hora
    
    let numero = text.match(comprobanteRegex) ? text.match(comprobanteRegex)[1] : "No encontrado";
    const nombres = text.match(nombresRegex) ? text.match(nombresRegex)[1] : "No encontrado";
    const monto = text.match(montoRegex) ? text.match(montoRegex)[1] : "No encontrado";
    let fecha = text.match(fechaRegex) ? text.match(fechaRegex)[1] : "No encontrada";

    // Si no se encuentra la fecha con el formato normal, busca la nueva fecha con hora
    if (fecha === "No encontrada" && text.match(fechaHoraRegex)) {
        const fechaMatch = text.match(fechaHoraRegex);
        fecha = `${fechaMatch[1]} ${fechaMatch[2]}`; // Formato "2025-02-05 13:28:23"
    }

    return { numero, nombres, monto, fecha };
}


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

// Crear un comprobante con OCR
app.post('/comprobantes', (req, res) => {
    let { text, whatsapp } = req.body;

    if (!text || !whatsapp) {
        return res.status(200).json({ message: "❌ No se recibió información válida", resumen: null });
    }

    const { numero, nombres, monto, fecha } = extraerDatosOCR(text);

    console.log("📥 Datos extraídos:", { numero, nombres, monto, fecha, whatsapp });

    // Verificar si el comprobante ya existe en MySQL
    db.query('SELECT * FROM Comprobante WHERE numero = ?', [numero], (err, results) => {
        if (err) {
            console.error("❌ Error en SELECT:", err);
            return res.status(200).json({ message: "❌ Error interno del servidor", resumen: null });
        }

        if (results.length > 0) {
            console.log("🚫 Comprobante ya registrado:", numero);

            const resumen = `📌 **Número:** ${results[0].numero}\n📞 **Enviado desde:** ${results[0].whatsapp}\n📅 **Fecha:** ${results[0].fecha}\n💰 **Monto:** $${monto}`;

            return res.status(200).json({
                message: `🚫 Este comprobante ya ha sido presentado por el número ${results[0].whatsapp}.`,
                resumen: resumen
            });
        }

        // Insertar en MySQL con los datos extraídos
        db.query('INSERT INTO Comprobante (numero, nombres, descripcion, fecha, whatsapp) VALUES (?, ?, ?, ?, ?)',
            [numero, nombres, "Pago recibido", fecha, whatsapp], (err) => {
                if (err) {
                    console.error("❌ Error en la inserción:", err);
                    return res.status(200).json({ message: "❌ Error al guardar el comprobante", resumen: null });
                }
                console.log("✅ Comprobante guardado en la base de datos");

                const resumen = `📌 **Número:** ${numero}\n📞 **Enviado desde:** ${whatsapp}\n📅 **Fecha:** ${fecha}\n💰 **Monto:** $${monto}`;

                res.status(200).json({ message: `✅ Comprobante registrado exitosamente desde el número ${whatsapp}.`, resumen });
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
            res.json({ message: '✅ Comprobante actualizado exitosamente' });
        });
});

// Eliminar un comprobante
app.delete('/comprobantes/:id', (req, res) => {
    const { id } = req.params;
    db.query('DELETE FROM Comprobante WHERE id = ?', [id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: '✅ Comprobante eliminado exitosamente' });
    });
});

// Iniciar el servidor en Railway
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
});
