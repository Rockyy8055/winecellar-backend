const ProductCategory = require("../models/productCategory");

const getAllProductCategories = async (req, res) => {
  try {
    const categories = await ProductCategory.find();
    res.status(200).json(categories);
  } catch (err) {
    res.status(500).json({ error: "Error getting product categories" });
  }
};

const getProductCategory = async (req, res) => {
  const { id } = req.params;
  try {
    const category = await ProductCategory.findById(id);
    if (!category) {
      return res.status(404).json({ error: "Product category not found" });
    }
    res.status(200).json(category);
  } catch (err) {
    res.status(500).json({ error: "Error getting product category" });
  }
};

const saveProductCategory = async (req, res) => {
  const { name, description } = req.body;
  try {
    const newCategory = new ProductCategory({ name, description });
    const savedCategory = await newCategory.save();
    res.status(200).json(savedCategory);
  } catch (err) {
    res.status(500).json({ error: "Error saving product category" });
  }
};

const deleteProductCategory = async (req, res) => {
  const { id } = req.params;
  try {
    const deletedCategory = await ProductCategory.findByIdAndDelete(id);
    if (!deletedCategory) {
      return res.status(404).json({ error: "Product category not found" });
    }
    res.status(200).json({ message: "Product category deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Error deleting product category" });
  }
};

const deleteManyProductCategories = async (req, res) => {
  const { ids } = req.body;
  try {
    const result = await ProductCategory.deleteMany({ _id: { $in: ids } });
    res
      .status(200)
      .json({ message: "Product categories deleted successfully", result });
  } catch (err) {
    res.status(500).json({ error: "Error deleting product categories" });
  }
};

const updateProductCategory = async (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;
  try {
    const updatedCategory = await ProductCategory.findByIdAndUpdate(
      id,
      { name, description },
      { new: true }
    );
    if (!updatedCategory) {
      return res.status(404).json({ error: "Product category not found" });
    }
    res.status(200).json(updatedCategory);
  } catch (err) {
    res.status(500).json({ error: "Error updating product category" });
  }
};

module.exports = {
  getAllProductCategories,
  getProductCategory,
  saveProductCategory,
  deleteProductCategory,
  deleteManyProductCategories,
  updateProductCategory,
};
