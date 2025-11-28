module.exports = (sequelize, DataTypes) => {
    const UserFootprint = sequelize.define('UserFootprint', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        user_id: {
            type: DataTypes.INTEGER,
            allowNull: true, // Can be null for guest users if you track them by session/IP later
            comment: 'ID of the user performing the action'
        },
        product_id: {
            type: DataTypes.INTEGER,
            allowNull: true, // Can be null if the action isn't product-specific (e.g., searching)
            comment: 'ID of the product interacted with'
        },
        // action_type: {
        //     type: DataTypes.STRING, // e.g., 'product_view', 'add_to_cart_click', 'search'
        //     allowNull: false,
        //     defaultValue: 'view'
        // },
        metadata: {
            type: DataTypes.JSON, // useful for storing extra info like search terms or filters used
            allowNull: true
        }
    }, {
        tableName: 'user_footprints',
        timestamps: true,
        updatedAt: false // We only care about creation time
    });

    return UserFootprint;
};