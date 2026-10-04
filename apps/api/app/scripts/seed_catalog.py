"""Seed a realistic demo marketplace. Idempotent, section by section.

python -m app.scripts.seed_catalog

- fragrance families + common notes (get-or-create by slug)
- platform catalogue: brands, categories, 24 products with note pyramids,
  gender and bottle sizes (skipped if any product exists)
- demo vendors with their own products, one awaiting moderation, and one
  pending application (skipped if any vendor exists; never in production)
- homepage banners (skipped if any banner exists)
"""

import asyncio
import re
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import func, select

import app.models  # noqa: F401 — register every mapper
from app.core import cache
from app.core.config import settings
from app.core.database import SessionLocal
from app.core.logging import configure_logging, get_logger
from app.core.security import hash_password
from app.modules.catalog import cache as _catalog_cache  # noqa: F401 — invalidation listeners
from app.modules.catalog.models import (
    Brand,
    Category,
    FragranceFamily,
    FragranceNote,
    Product,
    ProductImage,
    ProductNote,
    ProductVariant,
)
from app.modules.catalog.service import slugify
from app.modules.cms.models import Banner
from app.modules.users.models import Role, User
from app.modules.vendors.models import Vendor
from app.shared.enums import Gender, ProductStatus, VendorStatus

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


FAMILIES = [
    # (name, description) — the core olfactive families used for browsing.
    ("Floral", "Rose, jasmine, tuberose and other flowers at the heart."),
    ("White Floral", "Creamy, heady blooms: jasmine sambac, gardenia, orange blossom."),
    ("Woody", "Sandalwood, cedar, vetiver and oud."),
    ("Amber", "Warm resins, vanilla and spice (formerly 'Oriental')."),
    ("Woody Oriental", "Woods wrapped in amber, spice and incense."),
    ("Citrus", "Bergamot, lemon, yuzu and neroli — bright and fresh."),
    ("Aromatic", "Lavender, sage, rosemary and other herbs."),
    ("Aquatic", "Sea air, salt and watery accords."),
    ("Gourmand", "Edible notes: vanilla, caramel, coffee, praline."),
    ("Chypre", "Bergamot over oakmoss and patchouli."),
    ("Leather", "Smoky, supple leather and birch tar."),
    ("Green", "Cut grass, fig leaf, galbanum and crushed stems."),
]

# Where common notes belong, so note pages can be browsed by family.
NOTE_FAMILIES = {
    "Bergamot": "Citrus",
    "Lemon": "Citrus",
    "Grapefruit": "Citrus",
    "Yuzu": "Citrus",
    "Neroli": "Citrus",
    "Mandarin": "Citrus",
    "Rose": "Floral",
    "Peony": "Floral",
    "Iris": "Floral",
    "Violet": "Floral",
    "Jasmine": "White Floral",
    "Tuberose": "White Floral",
    "Orange Blossom": "White Floral",
    "Sandalwood": "Woody",
    "Cedarwood": "Woody",
    "Cedar": "Woody",
    "Vetiver": "Woody",
    "Oud": "Woody",
    "Amber": "Amber",
    "Vanilla": "Gourmand",
    "Tonka Bean": "Gourmand",
    "Lavender": "Aromatic",
    "Sage": "Aromatic",
    "Rosemary": "Aromatic",
    "Sea Salt": "Aquatic",
    "Patchouli": "Chypre",
    "Oakmoss": "Chypre",
    "Leather": "Leather",
    "Fig Leaf": "Green",
}

GENDERS = {"women": Gender.WOMEN, "men": Gender.MEN, "unisex": Gender.UNISEX}

# Demo marketplace sellers (never created in production). The owners can sign
# in with DEMO_VENDOR_PASSWORD to try the vendor portal.
DEMO_VENDOR_PASSWORD = "Vendor@12345"
VENDORS = [
    {
        "name": "Kathmandu Attar House",
        "slug": "kathmandu-attar-house",
        "email": "attar@vendors.example.com",
        "status": VendorStatus.APPROVED,
        "commission": Decimal("12.00"),
        "description": "Alcohol-free attars distilled in small batches in Thamel since 1994.",
        "tax_id": "PAN-301456789",
    },
    {
        "name": "Seoul Glow Lab",
        "slug": "seoul-glow-lab",
        "email": "glow@vendors.example.com",
        "status": VendorStatus.APPROVED,
        "commission": None,  # platform default
        "description": "Authorised Korean skincare importer, batch-tested for Nepal's climate.",
        "tax_id": "PAN-609876543",
    },
    {
        "name": "Lumière Niche Parfums",
        "slug": "lumiere-niche-parfums",
        "email": "lumiere@vendors.example.com",
        "status": VendorStatus.PENDING,  # an application waiting in the admin queue
        "commission": None,
        "description": "Independent French niche house applying to sell in Nepal.",
        "tax_id": None,
    },
]

VENDOR_PRODUCTS = {
    "kathmandu-attar-house": [
        dict(
            sku="KAH-ATR-001",
            name="Mitti Attar",
            slug="mitti-attar",
            category="unisex-fragrance",
            price="3200",
            family="Green",
            gender="unisex",
            notes={"TOP": ["Petrichor"], "HEART": ["Vetiver"], "BASE": ["Sandalwood"]},
            sizes=((6, 1.0, 40), (12, 1.8, 25)),
            short="The scent of first monsoon rain on baked earth, in sandalwood oil.",
            status=ProductStatus.PUBLISHED,
        ),
        dict(
            sku="KAH-ATR-002",
            name="Shamama Royal Attar",
            slug="shamama-royal-attar",
            category="unisex-fragrance",
            price="5400",
            family="Amber",
            gender="unisex",
            notes={"TOP": ["Saffron"], "HEART": ["Rose", "Oud"], "BASE": ["Amber", "Musk"]},
            sizes=((6, 1.0, 18), (12, 1.8, 10)),
            short="A dense, spiced amber attar aged for a full year.",
            status=ProductStatus.PUBLISHED,
        ),
        dict(
            sku="KAH-ATR-003",
            name="Rajanigandha Attar",
            slug="rajanigandha-attar",
            category="womens-fragrance",
            price="2900",
            family="White Floral",
            gender="women",
            notes={"TOP": ["Bergamot"], "HEART": ["Tuberose", "Jasmine"], "BASE": ["Sandalwood"]},
            sizes=((6, 1.0, 30),),
            short="Night-blooming tuberose distilled into sandalwood.",
            # Submitted, waiting for an admin — try the moderation queue with this one.
            status=ProductStatus.PENDING,
        ),
    ],
    "seoul-glow-lab": [
        dict(
            sku="SGL-SER-101",
            name="Rice Ferment Glow Serum",
            slug="rice-ferment-glow-serum",
            category="serums",
            price="2650",
            product_type="serum",
            sizes=((30, 1.0, 35), (50, 1.55, 20)),
            short="Fermented rice water and niacinamide for an even, dewy tone.",
            attrs={
                "skin_type": ["All", "Dull"],
                "key_ingredients": ["Rice Ferment", "Niacinamide"],
            },
            status=ProductStatus.PUBLISHED,
        ),
        dict(
            sku="SGL-SPF-102",
            name="Daily Mineral Sun Fluid SPF50+",
            slug="daily-mineral-sun-fluid-spf50",
            category="skincare",
            price="1950",
            product_type="sunscreen",
            sizes=((50, 1.0, 60),),
            short="Weightless zinc oxide fluid with no white cast.",
            attrs={"skin_type": ["All", "Sensitive"], "spf": "50+", "pa": "++++"},
            status=ProductStatus.PUBLISHED,
        ),
    ],
}

BANNERS = [
    dict(
        placement="home_hero",
        title="The Monsoon Edit",
        subtitle="Petrichor, vetiver and green notes for the rainy season.",
        link_url="/products?family=green",
        cta_label="Shop the edit",
        sort_order=0,
    ),
    dict(
        placement="home_hero",
        title="Attars from Thamel",
        subtitle="Alcohol-free perfume oils from Kathmandu Attar House.",
        link_url="/products?vendor=kathmandu-attar-house",
        cta_label="Discover attars",
        sort_order=1,
    ),
    dict(
        placement="home_hero",
        title="Glow, Seoul-style",
        subtitle="Korean skincare, batch-tested for Himalayan weather.",
        link_url="/products?vendor=seoul-glow-lab",
        cta_label="Shop skincare",
        sort_order=2,
    ),
    dict(
        placement="home_strip",
        title="Free delivery inside the valley on orders over Rs 5,000",
        link_url="/products",
        sort_order=0,
    ),
]


def _size_ml(*labels: object) -> Decimal | None:
    for label in labels:
        match = re.search(r"([0-9]+(?:\.[0-9]+)?)\s*ml\b", str(label or ""), re.IGNORECASE)
        if match:
            return Decimal(match.group(1))
    return None


class _Taxonomy:
    """Get-or-create families and notes by slug within one seeding session."""

    def __init__(self, db) -> None:
        self.db = db
        self.families: dict[str, FragranceFamily] = {}
        self.notes: dict[str, FragranceNote] = {}

    async def load(self) -> None:
        for f in await self.db.scalars(select(FragranceFamily)):
            self.families[f.slug] = f
        for n in await self.db.scalars(select(FragranceNote)):
            self.notes[n.slug] = n

    def family(self, name: str, description: str | None = None) -> FragranceFamily:
        slug = slugify(name)
        fam = self.families.get(slug)
        if fam is None:
            fam = FragranceFamily(
                name=name, slug=slug, description=description, sort_order=len(self.families)
            )
            self.db.add(fam)
            self.families[slug] = fam
        elif description and not fam.description:
            fam.description = description
        return fam

    def note(self, name: str) -> FragranceNote:
        slug = slugify(name)
        note = self.notes.get(slug)
        if note is None:
            family_name = NOTE_FAMILIES.get(name)
            note = FragranceNote(
                name=name, slug=slug, family=self.family(family_name) if family_name else None
            )
            self.db.add(note)
            self.notes[slug] = note
        return note

    def pyramid(self, by_position: dict[str, list[str]]) -> list[ProductNote]:
        rows: list[ProductNote] = []
        for position in ("TOP", "HEART", "BASE"):
            for i, name in enumerate(dict.fromkeys(by_position.get(position, []))):
                rows.append(ProductNote(note=self.note(name), position=position, sort_order=i))
        return rows


async def _seed_catalog(db, tax: _Taxonomy) -> None:
    if await db.scalar(select(func.count()).select_from(Product)):
        log.info("seed_catalog_skipped", reason="products already exist")
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
        attrs = spec["attributes"]
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
            attributes=attrs,
            tags=spec["tags"],
            rating_avg=Decimal(rating_avg),
            rating_count=rating_count,
            status=ProductStatus.PUBLISHED,
            published_at=now,
        )
        if spec["product_type"] == "perfume":
            p.gender = GENDERS.get(str(attrs.get("gender", "")).lower())
            p.fragrance_family = tax.family(attrs["fragrance_family"])
            p.notes = tax.pyramid(
                {
                    "TOP": attrs.get("top_notes", []),
                    "HEART": attrs.get("middle_notes", []),
                    "BASE": attrs.get("base_notes", []),
                }
            )
        for i, v in enumerate(spec["variants"]):
            p.variants.append(
                ProductVariant(
                    sku=f"{spec['sku']}-{i + 1}",
                    name=v["name"],
                    options=v["options"],
                    size_ml=_size_ml(*v["options"].values(), v["name"]),
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
    await db.flush()
    log.info(
        "seed_catalog_done", brands=len(brands), categories=len(categories), products=len(PRODUCTS)
    )


async def _seed_families(tax: _Taxonomy) -> None:
    for name, description in FAMILIES:
        tax.family(name, description)
    for note_name in NOTE_FAMILIES:
        tax.note(note_name)


async def _seed_vendors(db, tax: _Taxonomy) -> None:
    if settings.is_production:
        log.info("seed_vendors_skipped", reason="never seed demo vendors in production")
        return
    if await db.scalar(select(func.count()).select_from(Vendor)):
        log.info("seed_vendors_skipped", reason="vendors already exist")
        return

    roles = {r.name: r for r in await db.scalars(select(Role))}
    categories = {c.slug: c for c in await db.scalars(select(Category))}
    now = datetime.now(UTC)
    for spec in VENDORS:
        owner = await db.scalar(select(User).where(User.email == spec["email"]))
        if owner is None:
            owner = User(
                email=spec["email"],
                full_name=f"{spec['name']} (owner)",
                hashed_password=hash_password(DEMO_VENDOR_PASSWORD),
                is_email_verified=True,
                roles=[roles["CUSTOMER"]],
            )
            db.add(owner)
        if spec["status"] == VendorStatus.APPROVED:
            owner.roles.append(roles["VENDOR"])
        vendor = Vendor(
            owner=owner,
            name=spec["name"],
            slug=spec["slug"],
            description=spec["description"],
            logo_url=img(f"vendor-{spec['slug']}", 400, 400),
            contact_email=spec["email"],
            tax_id=spec["tax_id"],
            status=spec["status"],
            commission_rate=spec["commission"],
            reviewed_at=now if spec["status"] == VendorStatus.APPROVED else None,
        )
        db.add(vendor)

        for item in VENDOR_PRODUCTS.get(spec["slug"], []):
            ptype = item.get("product_type", "perfume")
            published = item["status"] == ProductStatus.PUBLISHED
            p = Product(
                vendor=vendor,
                sku=item["sku"],
                name=item["name"],
                slug=item["slug"],
                short_description=item["short"],
                description=item["short"],
                product_type=ptype,
                category=categories.get(item["category"]),
                base_price=Decimal(item["price"]),
                attributes=item.get("attrs", {}),
                tags=[ptype],
                status=item["status"],
                submitted_at=now,
                reviewed_at=now if published else None,
                published_at=now if published else None,
            )
            if ptype == "perfume":
                p.gender = GENDERS[item["gender"]]
                p.fragrance_family = tax.family(item["family"])
                p.notes = tax.pyramid(item["notes"])
                p.attributes = {"concentration": "Attar (perfume oil)"}
            for i, (ml, mult, stock) in enumerate(item["sizes"]):
                p.variants.append(
                    ProductVariant(
                        sku=f"{item['sku']}-{ml}",
                        name=f"{ml} ml",
                        options={"volume": f"{ml} ml"},
                        size_ml=Decimal(ml),
                        price=(Decimal(item["price"]) * Decimal(str(mult))).quantize(Decimal("1")),
                        stock_quantity=stock,
                        is_default=i == 0,
                        sort_order=i,
                    )
                )
            p.images.append(
                ProductImage(url=img(item["slug"]), alt=item["name"], sort_order=0, is_primary=True)
            )
            db.add(p)
    await db.flush()
    log.info("seed_vendors_done", vendors=len(VENDORS))


async def _seed_banners(db) -> None:
    if await db.scalar(select(func.count()).select_from(Banner)):
        log.info("seed_banners_skipped", reason="banners already exist")
        return
    for i, spec in enumerate(BANNERS):
        db.add(Banner(image_url=img(f"banner-{i}", 1600, 640), **spec))
    log.info("seed_banners_done", banners=len(BANNERS))


async def seed() -> None:
    """Each section checks for its own data, so re-running only fills gaps —
    e.g. a database seeded before vendors existed gets vendors and banners."""
    configure_logging()
    async with SessionLocal() as db:
        tax = _Taxonomy(db)
        await tax.load()
        await _seed_families(tax)
        await _seed_catalog(db, tax)
        await _seed_vendors(db, tax)
        await _seed_banners(db)
        await db.commit()
    await cache.drain()  # let the commit's catalog-cache invalidation finish
    log.info("seed_done")


if __name__ == "__main__":
    asyncio.run(seed())
