const Product = require('../model/Product');

exports.getProducts = async (req, res) => {
  try {
    // Fetch all products, including those with CRM fields
    const products = await Product.find({ isDeleted: { $ne: true } }).sort({ updatedAt: -1 });
    res.json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.addProduct = async (req, res) => {
  try {
    const { 
      name, category, badge, description, basePrice, benefits, variants, media, color,
      sku, costPrice, sellingPrice, currentStock, lowStockThreshold, isActive,
      quantity, unit, baseVariant, discountPercent
    } = req.body;

    // Auto-generate a unique sequential Product ID (KD-P001, KD-P002, ...)
    const lastProduct = await Product.findOne({ productId: /^KD-P\d+$/ })
      .sort({ productId: -1 })
      .lean();
    let nextNum = 1;
    if (lastProduct && lastProduct.productId) {
      const match = lastProduct.productId.match(/KD-P(\d+)/);
      if (match) nextNum = parseInt(match[1], 10) + 1;
    }
    const generatedId = `KD-P${String(nextNum).padStart(3, '0')}`;

    const images = (media || []).filter(m => typeof m === 'string' && m.startsWith('data:image'));
    const videos = (media || []).filter(m => typeof m === 'string' && m.startsWith('data:video'));

    // Build baseVariant: use the one from req.body if provided, otherwise construct from individual fields
    const resolvedUnit = unit || (category === 'Groceries' || (name && name.toLowerCase().includes('jaggery')) ? 'kg' : 'ml');
    const resolvedQty = quantity || (resolvedUnit === 'kg' ? 1 : 500);
    const resolvedPrice = parseFloat(sellingPrice) || parseFloat(basePrice) || 0;
    const resolvedBaseVariant = baseVariant && baseVariant.label
      ? baseVariant
      : {
          label: `${resolvedQty} ${resolvedUnit}`,
          quantity: resolvedQty,
          unit: resolvedUnit,
          price: resolvedPrice
        };

    const product = new Product({
      id: generatedId,
      productId: generatedId,
      name,
      category,
      badge,
      description: description || 'No description provided',
      image: images[0] || (media?.[0] && !media[0].startsWith('data:video') ? media[0] : ''), 
      image2: images[1] || '',
      videoUrl: videos[0] || '',
      baseVariant: resolvedBaseVariant,
      basePrice: basePrice || sellingPrice?.toString() || '0',
      benefits: benefits || [],
      variants: variants || [],
      media: media || [],
      color: color || 'from-blue-500 to-cyan-500',
      // CRM Fields
      sku: sku || generatedId,
      costPrice: costPrice || 0,
      sellingPrice: sellingPrice || parseFloat(basePrice) || 0,
      currentStock: currentStock || 0,
      lowStockThreshold: lowStockThreshold || 10,
      isActive: isActive !== undefined ? isActive : true,
      quantity: resolvedQty,
      unit: resolvedUnit,
      discountPercent: Number(discountPercent) || 0
    });
    
    await product.save();
    res.status(201).json(product);
  } catch (error) {
    console.error('Error adding product:', error);
    res.status(500).json({ error: 'Controller Error', message: error.message });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    // Handle specific mapping for website fields if they come from CRM
    if (updateData.sellingPrice && !updateData.basePrice) {
        updateData.basePrice = updateData.sellingPrice.toString();
    }

    const updatedProduct = await Product.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!updatedProduct) return res.status(404).json({ error: 'Product not found' });
    res.json(updatedProduct);
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ error: 'Controller Error', message: error.message });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    // Strict requirement: Soft delete to keep historical data in CRM
    const product = await Product.findByIdAndUpdate(id, { isDeleted: true }, { new: true });
    
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
