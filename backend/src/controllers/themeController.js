const { Theme } = require('../models');
const streamifier = require('streamifier');
const cloudinary = require('../utils/cloudinary.js'); 


const getAllThemes = async (req, res) => {
  try {
    const themes = await Theme.findAll({
      order: [['createdAt', 'DESC']],
      // where: { is_active: 1}
    });

    return res.status(200).json({
      success: true,
      data: themes.map(theme => ({
        id: theme.id,
        name: theme.name,
        description: theme.description,
        image_url: theme.image_url || null,
        createdAt: theme.createdAt,
        updatedAt: theme.updatedAt,
        is_active: theme.is_active
      })),
    });
  } catch (error) {
    console.error('Error fetching themes:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch themes',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

const createTheme = async (req, res) => {
  try {
    const { name, slug, description } = req.body;
    let image_url = null;

    if (req.files && req.files.length > 0) {
    
    const uploadPromise = req.files.map((file, index) => {
        return new Promise((resolve, reject) =>{
            const uploadStream = cloudinary.uploader.upload_stream({
                folder: 'upload/theme',
                public_id: `theme-${Date.now()}`,
                resource_type: "auto"

            }, 
        (error, result) => {
            if(error){
                console.log('cloudinary upload error', error);
                return reject(error);
            }
            resolve({
                      name,
                      slug,
                      description,
                      image_url: result.secure_url,
                      public_id: result.public_id,
                      created_by: null
            });
        }
        );
        streamifier.createReadStream(file.buffer).pipe(uploadStream);
        
        });
    });
    const themeData = await Promise.all(uploadPromise);


    // const theme = await Theme.create({
    //   name,
    //   slug,
    //   description,
    //   image_url,
    // });
    console.log('themedata >> ', themeData);
    const { image_url, public_id } = themeData[0];

    console.log('image url is >> ', image_url, "public id", public_id);
    const theme = await Theme.create({
        name: name,
        slug: slug,
        description: description,
        image_url: image_url,
        public_id: public_id
    });

    res.status(201).json({
      success: true,
      message: 'Theme created successfully',
      data: themeData,
    });
  }
  
}catch (error) {
    console.error('Create Theme Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create theme',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};


// DELETE THEME
const deleteTheme = async (req, res) => {
  try {
    const { id } = req.params;

    const theme = await Theme.findByPk(id);
    if (!theme) {
      return res.status(404).json({
        success: false,
        message: 'Theme not found'
      });
    }

    // Optional: Ownership check
    // if (req.user.role !== 'admin' && theme.created_by !== req.user.id) {
    //   return res.status(403).json({
    //     success: false,
    //     message: 'You can only delete your own themes'
    //   });
    // }

    // Delete Cloudinary image if exists
    if (theme.public_id) {
      await cloudinary.uploader.destroy(theme.public_id);
    }

    await theme.destroy();

    res.json({
      success: true,
      message: 'Theme deleted successfully'
    });
  } catch (err) {
    console.error('Delete Theme Error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to delete theme'
    });
  }
};
const setActiveTheme = async (req, res) => {
  try {
    const { id } = req.params;

    // First, make all themes inactive
    await Theme.update({ is_active: false }, { where: {} });

    // Set the selected theme active
    const [updatedRows] = await Theme.update(
      { is_active: true },
      { where: { id } }
    );

    if (updatedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Theme not found'
      });
    }

    res.json({
      success: true,
      message: 'Theme marked as active successfully'
    });
  } catch (error) {
    console.error('Set Active Theme Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update theme usage'
    });
  }
};


module.exports = {
  createTheme,
  deleteTheme,
  getAllThemes,
  setActiveTheme
};
