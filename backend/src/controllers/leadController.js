const { Leads } = require('../models');

const createLead = async (req, res) => {
  try {
    const { name, email, contact } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Name is required"
      });
    }

    const lead = await Leads.create({
      name,
      email,
      contact
    });

    return res.status(201).json({
      success: true,
      message: "Lead stored successfully",
      data: { lead }
    });

  } catch (error) {
    console.error("Lead creation error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to store lead"
    });
  }
};

const getLeads = async (req, res) => {
  try {
    const allLeads = await Leads.findAll({
      order: [['id', 'DESC']]
    });

    return res.json({
      success: true,
      data: { leads: allLeads }
    });

  } catch (error) {
    console.error("Fetch leads error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch leads"
    });
  }
};

module.exports = { createLead, getLeads };