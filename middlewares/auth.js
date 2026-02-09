// middlewares/auth.js

// Middleware para verificar autenticación (para vistas)
const requireAuth = (req, res, next) => {
    if (!req.session || !req.session.user) {
        return res.redirect('/login');
    }
    next();
};

// Middleware para API (JSON)
const authenticateToken = (req, res, next) => {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ error: 'No autorizado' });
    }
    req.user = req.session.user;
    next();
};

// Middleware para roles específicos
const requireRole = (...roles) => {
    return (req, res, next) => {
        if (!req.session || !req.session.user) {
            return res.redirect('/login');
        }
        
        if (!roles.includes(req.session.user.role)) {
            return res.status(403).render('error', {
                message: 'No tienes permiso para acceder a esta página',
                error: {}
            });
        }
        next();
    };
};

module.exports = {
    requireAuth,
    authenticateToken,
    requireRole
};