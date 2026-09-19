"""Seed a demo catalog. Idempotent: skips if any product exists.

python -m app.scripts.seed_catalog
"""

import asyncio
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import func, select

from app.core.database import SessionLocal
from app.core.logging import configure_logging, get_logger
from app.modules.catalog.models import Brand, Category, Product, ProductImage, ProductVariant
from app.shared.enums import ProductStatus

log = get_logger(__name__)


def img(seed: str, w: int = 900, h: int = 1100) -> str:
    return f"https://picsum.photos/seed/{seed}/{w}/{h}"


BRANDS = [
    ("Maison Noir", "maison-noir", "FR", "Parisian niche perfumery since 1987."),
    ("Aurelia", "aurelia", "IT", "Modern Italian fragrances with Mediterranean soul."),
    ("Kōri Beauty", "kori-beauty", "JP", "Minimal skincare rooted in Japanese rituals."),
    ("Velour", "velour", "US", "High-pigment, long-wear colour cosmetics."),
    ("Himalaya Botanics", "himalaya-botanics", "NP", "Botanical hair and body care from Nepal."),
    ("Solstice", "solstice", "GB", "Clean, gender-free scents for every season."),
]

CATEGORIES = [
    # (name, slug, parent_slug, description)
    ("Perfumes", "perfumes", None, "Eau de parfum, eau de toilette and extraits."),
    ("Women's Fragrance", "womens-fragrance", "perfumes", None),
    ("Men's Fragrance", "mens-fragrance", "perfumes", None),
    ("Unisex Fragrance", "unisex-fragrance", "perfumes", None),
    ("Cosmetics", "cosmetics", None, "Face, lip and eye colour."),
    ("Lipstick", "lipstick", "cosmetics", None),
    ("Foundation", "foundation", "cosmetics", None),
    ("Skincare", "skincare", None, "Cleansers, serums, moisturisers and SPF."),
    ("Serums", "serums", "skincare", None),
    ("Moisturisers", "moisturisers", "skincare", None),
    ("Hair Care", "hair-care", None, "Shampoo, conditioner and treatments."),
    ("Body Care", "body-care", None, "Body wash, lotion and oils."),
]


def perfume(
    sku,
    name,
    slug,
    brand,
    cat,
    price,
    family,
    top,
    mid,
    base,
    gender,
    longevity,
    sillage,
    seasons,
    occasions,
    *,
    featured=False,
    compare=None,
    rating=("4.6", 120),
    short=None,
    desc=None,
    sizes=((30, 0.62), (50, 1.0), (100, 1.7)),
    stock=(12, 25, 8),
):
    return dict(
        sku=sku,
        name=name,
        slug=slug,
        brand=brand,
        category=cat,
        product_type="perfume",
        base_price=Decimal(price),
        compare_at_price=Decimal(compare) if compare else None,
        is_featured=featured,
        rating=rating,
        short_description=short
        or f"{family} eau de parfum with {top[0].lower()} and {base[0].lower()}.",
        description=desc
        or (
            f"{name} opens with {', '.join(top).lower()}, settles into a heart of "
            f"{', '.join(mid).lower()} and dries down to {', '.join(base).lower()}. "
            f"A {family.lower()} fragrance made for {' and '.join(occasions).lower()}."
        ),
        attributes={
            "fragrance_family": family,
            "top_notes": top,
            "middle_notes": mid,
            "base_notes": base,
            "gender": gender,
            "longevity": longevity,
            "sillage": sillage,
            "season": seasons,
            "occasion": occasions,
            "concentration": "Eau de Parfum",
        },
        tags=[family.lower(), gender.lower(), *[s.lower() for s in seasons]],
        variants=[
            {
                "name": f"{ml} ml",
                "options": {"volume": f"{ml} ml"},
                "price": (Decimal(price) * Decimal(str(mult))).quantize(Decimal("1")),
                "stock": stk,
                "default": ml == 50,
            }
            for (ml, mult), stk in zip(sizes, stock, strict=True)
        ],
    )


def cosmetic(
    sku,
    name,
    slug,
    brand,
    cat,
    price,
    ptype,
    attrs,
    shades,
    *,
    featured=False,
    compare=None,
    rating=("4.4", 80),
    short=None,
    desc=None,
    stock=15,
):
    return dict(
        sku=sku,
        name=name,
        slug=slug,
        brand=brand,
        category=cat,
        product_type=ptype,
        base_price=Decimal(price),
        compare_at_price=Decimal(compare) if compare else None,
        is_featured=featured,
        rating=rating,
        short_description=short,
        description=desc,
        attributes=attrs,
        tags=[ptype, *[k for k in attrs.get("skin_type", [])]],
        variants=[
            {
                "name": s,
                "options": {"shade" if ptype in ("lipstick", "foundation") else "size": s},
                "price": Decimal(price),
                "stock": stock,
                "default": i == 0,
            }
            for i, s in enumerate(shades)
        ],
    )


PRODUCTS = [
    perfume(
        "MN-OUD-001",
        "Oud Nocturne",
        "oud-nocturne",
        "maison-noir",
        "unisex-fragrance",
        "18500",
        "Woody Oriental",
        ["Saffron", "Pink Pepper"],
        ["Oud", "Rose", "Leather"],
        ["Amber", "Sandalwood", "Musk"],
        "Unisex",
        "12+ hours",
        "Heavy",
        ["Autumn", "Winter"],
        ["Evening", "Special occasion"],
        featured=True,
        rating=("4.8", 312),
        compare="21000",
    ),
    perfume(
        "MN-IRS-002",
        "Iris Poudré",
        "iris-poudre",
        "maison-noir",
        "womens-fragrance",
        "14200",
        "Floral",
        ["Bergamot", "Violet Leaf"],
        ["Iris", "Peony", "Orris"],
        ["Tonka", "White Musk", "Cashmeran"],
        "Women",
        "8 hours",
        "Moderate",
        ["Spring", "Autumn"],
        ["Daytime", "Office"],
        rating=("4.7", 188),
    ),
    perfume(
        "MN-VET-003",
        "Vétiver Sauvage",
        "vetiver-sauvage",
        "maison-noir",
        "mens-fragrance",
        "13800",
        "Woody Aromatic",
        ["Grapefruit", "Black Pepper"],
        ["Vetiver", "Geranium"],
        ["Cedar", "Oakmoss"],
        "Men",
        "9 hours",
        "Moderate",
        ["Spring", "Summer"],
        ["Daytime", "Office"],
        featured=True,
        rating=("4.6", 240),
    ),
    perfume(
        "AU-LIM-004",
        "Limone di Capri",
        "limone-di-capri",
        "aurelia",
        "unisex-fragrance",
        "9800",
        "Citrus",
        ["Lemon", "Mandarin", "Basil"],
        ["Neroli", "Sea Salt"],
        ["White Musk", "Driftwood"],
        "Unisex",
        "5 hours",
        "Light",
        ["Summer"],
        ["Daytime", "Beach"],
        rating=("4.5", 402),
    ),
    perfume(
        "AU-FIC-005",
        "Fico Nero",
        "fico-nero",
        "aurelia",
        "unisex-fragrance",
        "11400",
        "Green",
        ["Fig Leaf", "Green Mandarin"],
        ["Fig", "Coconut Milk"],
        ["Cedar", "Benzoin"],
        "Unisex",
        "7 hours",
        "Moderate",
        ["Spring", "Summer"],
        ["Daytime"],
        featured=True,
        rating=("4.7", 156),
    ),
    perfume(
        "AU-ROS-006",
        "Rosa Toscana",
        "rosa-toscana",
        "aurelia",
        "womens-fragrance",
        "12600",
        "Floral Chypre",
        ["Pear", "Pink Pepper"],
        ["Damask Rose", "Lily of the Valley"],
        ["Patchouli", "Musk"],
        "Women",
        "8 hours",
        "Moderate",
        ["Spring", "Autumn"],
        ["Daytime", "Evening"],
        rating=("4.4", 97),
    ),
    perfume(
        "SO-AMB-007",
        "Amber Solstice",
        "amber-solstice",
        "solstice",
        "unisex-fragrance",
        "8900",
        "Amber",
        ["Cardamom", "Orange"],
        ["Labdanum", "Benzoin"],
        ["Amber", "Vanilla", "Tonka"],
        "Unisex",
        "10 hours",
        "Heavy",
        ["Autumn", "Winter"],
        ["Evening"],
        compare="10500",
        rating=("4.6", 211),
    ),
    perfume(
        "SO-SEA-008",
        "Sea Glass",
        "sea-glass",
        "solstice",
        "unisex-fragrance",
        "8200",
        "Aquatic",
        ["Sea Notes", "Yuzu"],
        ["Ambergris Accord", "Lotus"],
        ["Driftwood", "Musk"],
        "Unisex",
        "6 hours",
        "Light",
        ["Summer"],
        ["Daytime", "Beach"],
        rating=("4.3", 143),
    ),
    perfume(
        "SO-TEA-009",
        "Smoked Tea",
        "smoked-tea",
        "solstice",
        "mens-fragrance",
        "9400",
        "Aromatic",
        ["Bergamot", "Black Tea"],
        ["Lapsang", "Incense"],
        ["Birch Tar", "Vetiver"],
        "Men",
        "8 hours",
        "Moderate",
        ["Autumn", "Winter"],
        ["Evening", "Office"],
        rating=("4.5", 88),
    ),
    perfume(
        "MN-TUB-010",
        "Tubéreuse Absolue",
        "tubereuse-absolue",
        "maison-noir",
        "womens-fragrance",
        "16900",
        "White Floral",
        ["Green Leaves", "Mandarin"],
        ["Tuberose", "Jasmine", "Ylang"],
        ["Coconut", "Sandalwood"],
        "Women",
        "10 hours",
        "Heavy",
        ["Summer", "Autumn"],
        ["Evening", "Special occasion"],
        rating=("4.8", 76),
    ),
    perfume(
        "AU-CED-011",
        "Cedro & Sale",
        "cedro-e-sale",
        "aurelia",
        "mens-fragrance",
        "10200",
        "Woody",
        ["Sea Salt", "Bergamot"],
        ["Cedar", "Sage"],
        ["Ambroxan", "Musk"],
        "Men",
        "7 hours",
        "Moderate",
        ["Spring", "Summer"],
        ["Daytime"],
        rating=("4.4", 119),
    ),
    perfume(
        "SO-VIO-012",
        "Violet Hour",
        "violet-hour",
        "solstice",
        "womens-fragrance",
        "8600",
        "Floral Gourmand",
        ["Blackcurrant", "Violet"],
        ["Heliotrope", "Iris"],
        ["Vanilla", "Praline"],
        "Women",
        "8 hours",
        "Moderate",
        ["Autumn", "Winter"],
        ["Evening"],
        rating=("4.5", 164),
    ),
    cosmetic(
        "VL-LIP-101",
        "Velvet Matte Lipstick",
        "velvet-matte-lipstick",
        "velour",
        "lipstick",
        "2400",
        "lipstick",
        {
            "finish": "Matte",
            "coverage": "Full",
            "volume": "3.5 g",
            "ingredients": ["Shea Butter", "Vitamin E"],
            "skin_type": ["All"],
        },
        ["Rouge 01", "Terracotta 04", "Mauve 07", "Berry 12"],
        featured=True,
        rating=("4.6", 530),
    ),
    cosmetic(
        "VL-LIP-102",
        "Satin Glow Lipstick",
        "satin-glow-lipstick",
        "velour",
        "lipstick",
        "2200",
        "lipstick",
        {
            "finish": "Satin",
            "coverage": "Medium",
            "volume": "3.5 g",
            "ingredients": ["Jojoba Oil"],
            "skin_type": ["All"],
        },
        ["Nude 02", "Coral 05", "Rosewood 09"],
        rating=("4.4", 210),
    ),
    cosmetic(
        "VL-FND-103",
        "Second Skin Foundation",
        "second-skin-foundation",
        "velour",
        "foundation",
        "4800",
        "foundation",
        {
            "finish": "Natural",
            "coverage": "Medium-Buildable",
            "volume": "30 ml",
            "spf": "SPF 20",
            "skin_type": ["Normal", "Combination", "Dry"],
        },
        ["Fair 1N", "Light 2W", "Medium 3N", "Tan 4W", "Deep 5N", "Rich 6C"],
        featured=True,
        rating=("4.5", 388),
        stock=10,
    ),
    cosmetic(
        "VL-FND-104",
        "Matte Fix Foundation",
        "matte-fix-foundation",
        "velour",
        "foundation",
        "4500",
        "foundation",
        {
            "finish": "Matte",
            "coverage": "Full",
            "volume": "30 ml",
            "skin_type": ["Oily", "Combination"],
        },
        ["Light 2N", "Medium 3W", "Tan 4N", "Deep 5W"],
        rating=("4.3", 142),
        stock=8,
    ),
    cosmetic(
        "KB-SER-201",
        "Rice Water Serum",
        "rice-water-serum",
        "kori-beauty",
        "serums",
        "3900",
        "skincare",
        {
            "skin_type": ["All", "Dull"],
            "volume": "30 ml",
            "key_ingredients": ["Rice Ferment", "Niacinamide 5%"],
            "concern": ["Brightening", "Texture"],
        },
        ["30 ml"],
        featured=True,
        rating=("4.7", 640),
        short="Brightening niacinamide serum with fermented rice water.",
        desc=(
            "A lightweight, fast-absorbing serum that evens tone and refines texture "
            "with 5% niacinamide and fermented rice water. Fragrance-free."
        ),
    ),
    cosmetic(
        "KB-SER-202",
        "Hyaluronic Dew Serum",
        "hyaluronic-dew-serum",
        "kori-beauty",
        "serums",
        "3600",
        "skincare",
        {
            "skin_type": ["Dry", "Dehydrated"],
            "volume": "30 ml",
            "key_ingredients": ["3-weight Hyaluronic Acid", "Panthenol"],
            "concern": ["Hydration"],
        },
        ["30 ml"],
        rating=("4.6", 412),
        short="Multi-weight hyaluronic acid for plump, dewy skin.",
    ),
    cosmetic(
        "KB-MST-203",
        "Ceramide Barrier Cream",
        "ceramide-barrier-cream",
        "kori-beauty",
        "moisturisers",
        "4200",
        "skincare",
        {
            "skin_type": ["Dry", "Sensitive"],
            "volume": "50 ml",
            "key_ingredients": ["Ceramides NP/AP/EOP", "Squalane"],
            "concern": ["Barrier repair"],
        },
        ["50 ml"],
        rating=("4.8", 298),
        short="Rich ceramide cream that restores the skin barrier overnight.",
    ),
    cosmetic(
        "KB-MST-204",
        "Water Gel Moisturiser",
        "water-gel-moisturiser",
        "kori-beauty",
        "moisturisers",
        "3300",
        "skincare",
        {
            "skin_type": ["Oily", "Combination"],
            "volume": "50 ml",
            "key_ingredients": ["Green Tea", "Centella"],
            "concern": ["Oil control", "Soothing"],
        },
        ["50 ml"],
        rating=("4.5", 187),
        short="Oil-free gel that hydrates without shine.",
    ),
    cosmetic(
        "HB-SHP-301",
        "Amla & Bhringraj Shampoo",
        "amla-bhringraj-shampoo",
        "himalaya-botanics",
        "hair-care",
        "1400",
        "hair_care",
        {
            "hair_type": ["All", "Thinning"],
            "volume": "250 ml",
            "key_ingredients": ["Amla", "Bhringraj", "Shikakai"],
            "sulfate_free": True,
        },
        ["250 ml", "500 ml"],
        rating=("4.4", 512),
        short="Sulfate-free strengthening shampoo with Himalayan herbs.",
    ),
    cosmetic(
        "HB-OIL-302",
        "Rhododendron Hair Oil",
        "rhododendron-hair-oil",
        "himalaya-botanics",
        "hair-care",
        "1900",
        "hair_care",
        {
            "hair_type": ["Dry", "Damaged"],
            "volume": "100 ml",
            "key_ingredients": ["Rhododendron", "Argan", "Coconut"],
        },
        ["100 ml"],
        featured=True,
        rating=("4.7", 233),
        short="Cold-pressed pre-wash oil for shine and strength.",
    ),
    cosmetic(
        "HB-BDY-303",
        "Himalayan Salt Body Scrub",
        "himalayan-salt-body-scrub",
        "himalaya-botanics",
        "body-care",
        "1700",
        "body_care",
        {
            "skin_type": ["All"],
            "volume": "200 g",
            "key_ingredients": ["Pink Salt", "Apricot Kernel Oil"],
        },
        ["200 g"],
        rating=("4.5", 176),
        short="Exfoliating pink salt scrub with apricot oil.",
    ),
    cosmetic(
        "HB-LTN-304",
        "Yak Butter Body Lotion",
        "yak-butter-body-lotion",
        "himalaya-botanics",
        "body-care",
        "1600",
        "body_care",
        {"skin_type": ["Dry"], "volume": "250 ml", "key_ingredients": ["Yak Butter", "Calendula"]},
        ["250 ml"],
        rating=("4.6", 141),
        short="Deeply nourishing lotion for dry mountain air.",
    ),
]


async def seed() -> None:
    configure_logging()
    async with SessionLocal() as db:
        if await db.scalar(select(func.count()).select_from(Product)):
            log.info("seed_skipped", reason="products already exist")
            return

        brands = {}
        for name, slug, country, desc in BRANDS:
            b = Brand(
                name=name,
                slug=slug,
                country=country,
                description=desc,
                logo_url=img(f"brand-{slug}", 400, 400),
            )
            db.add(b)
            brands[slug] = b

        categories = {}
        for i, (name, slug, parent, desc) in enumerate(CATEGORIES):
            c = Category(
                name=name,
                slug=slug,
                description=desc,
                sort_order=i,
                parent=categories[parent] if parent else None,
                image_url=img(f"cat-{slug}", 800, 600) if parent is None else None,
            )
            db.add(c)
            categories[slug] = c

        await db.flush()

        now = datetime.now(UTC)
        for spec in PRODUCTS:
            rating_avg, rating_count = spec["rating"]
            p = Product(
                sku=spec["sku"],
                name=spec["name"],
                slug=spec["slug"],
                short_description=spec["short_description"],
                description=spec["description"],
                product_type=spec["product_type"],
                brand=brands[spec["brand"]],
                category=categories[spec["category"]],
                base_price=spec["base_price"],
                compare_at_price=spec["compare_at_price"],
                is_featured=spec["is_featured"],
                attributes=spec["attributes"],
                tags=spec["tags"],
                rating_avg=Decimal(rating_avg),
                rating_count=rating_count,
                status=ProductStatus.PUBLISHED,
                published_at=now,
            )
            for i, v in enumerate(spec["variants"]):
                p.variants.append(
                    ProductVariant(
                        sku=f"{spec['sku']}-{i + 1}",
                        name=v["name"],
                        options=v["options"],
                        price=v["price"],
                        compare_at_price=spec["compare_at_price"] if v["default"] else None,
                        stock_quantity=v["stock"],
                        is_default=v["default"],
                        sort_order=i,
                    )
                )
            for i in range(3):
                p.images.append(
                    ProductImage(
                        url=img(f"{spec['slug']}-{i}"),
                        alt=f"{spec['name']} view {i + 1}",
                        sort_order=i,
                        is_primary=i == 0,
                    )
                )
            db.add(p)

        await db.commit()
        log.info(
            "seed_done", brands=len(brands), categories=len(categories), products=len(PRODUCTS)
        )


if __name__ == "__main__":
    asyncio.run(seed())
