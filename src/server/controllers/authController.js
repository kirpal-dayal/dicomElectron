const User = require('../userModel');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// 🧾 Registrar usuario
exports.registerUser = async (req, res) => {
  const { username, password, role } = req.body;

  console.log("📝 Intentando registrar usuario:", { username, role });

  if (!username || !password || !role) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  }

  try {
    const userExists = await User.findOne({ username });
    if (userExists) {
      console.log("❌ El usuario ya existe:", username);
      return res.status(400).json({ error: 'El usuario ya existe' });
    }

    const newUser = new User({
      username,
      password, // Será hasheada por el pre-save hook en el modelo
      role,
      createdBy: req.user?.userId || null
    });

    await newUser.save();
    console.log("✅ Usuario registrado con éxito:", newUser.username);

    res.status(201).json({ message: 'Usuario creado correctamente' });

  } catch (err) {
    console.error("🚨 Error al registrar usuario:", err);
    res.status(500).json({ error: 'Error al registrar usuario' });
  }
};

// 🔐 Login
exports.loginUser = async (req, res) => {
  const { username, password } = req.body;

  console.log("🔐 Intentando iniciar sesión con:", username);

  if (!username || !password) {
    return res.status(400).json({ error: 'Campos incompletos' });
  }

  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Contraseña incorrecta' });
    }

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    console.log("🪪 Token generado para:", user.username);

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        role: user.role
      }
    });

  } catch (err) {
    console.error("🚨 Error en login:", err);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
};

// 👤 Obtener perfil
exports.getUser = async (req, res) => {
  console.log("📄 Obteniendo perfil para:", req.user?.userId);

  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json(user);
  } catch (err) {
    console.error("🚨 Error al obtener perfil:", err);
    res.status(500).json({ error: 'Error al obtener perfil' });
  }
};
