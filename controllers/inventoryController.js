const Inventory = require("../models/inventory");

const addInventory = async (req, res) => {
  try {
    const newInventory = new Inventory(req.body);
    const savedInventory = await newInventory.save();
    res.status(201).json(savedInventory);
  } catch (error) {
    res.status(500).json({ message: "Error adding inventory", error });
  }
};

module.exports = {
  addInventory,
};
