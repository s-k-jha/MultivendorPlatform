module.exports = (sequelize, DataTypes) => {
    const CarouselImage = sequelize.define('CarouselImage', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        image_url: {
            type: DataTypes.STRING,
            allowNull: false,
            comment: 'The secure URL of the image hosted on Cloudinary.'
        },
        public_id: {
            type: DataTypes.STRING,
            allowNull: false,
            comment: 'The Cloudinary public_id, used for deleting the image.'
        },
        title: {
            type: DataTypes.STRING,
            allowNull: true,
            comment: 'A title for the carousel slide, used for alt text and SEO.'
        },
        link_url: {
            type: DataTypes.STRING,
            allowNull: true,
            comment: 'The destination URL when the carousel image is clicked.'
        },
        display_order: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
            comment: 'The order in which the images appear in the carousel.'
        },
        is_active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
            comment: 'Whether the carousel image is currently active and should be displayed.'
        }
    }, {
        tableName: 'carousel_images',
        timestamps: true,
    });

    return CarouselImage;
};
