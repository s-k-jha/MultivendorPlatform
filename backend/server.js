const app = require('./src/app');
const { sequelize } = require('./src/models');
require('./src/utils/redis');

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connected successfully');
    
    // Sync database (create tables)
    await sequelize.sync({ force: false });
    console.log('Database synchronized');
    
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV}`);
    });
  } catch (error) {
    console.error('Unable to start server:', error);
    process.exit(1);
  }
};

startServer();