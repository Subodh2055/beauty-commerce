"""Shared scent vocabulary.

Two jobs:
1. `family_hints` adds plain-language descriptors to a product's embedded text
   ("Citrus" → "fresh zesty bright summer daytime"), so a query like "fresh
   scent for summer" lands near citrus products even with a lexical model.
2. The quiz answers (mood, occasion, season) map to families and notes that
   suit them; the quiz scores products against those as well as semantically.

Names are matched case-insensitively against FragranceFamily/FragranceNote names.
"""

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Profile:
    label: str
    words: str  # added to the quiz query text
    families: frozenset[str] = field(default_factory=frozenset)
    notes: frozenset[str] = field(default_factory=frozenset)


def _p(label: str, words: str, families: str = "", notes: str = "") -> Profile:
    split = lambda s: frozenset(x.strip().lower() for x in s.split(",") if x.strip())  # noqa: E731
    return Profile(label, words, split(families), split(notes))


FAMILY_HINTS: dict[str, str] = {
    "citrus": "fresh zesty bright uplifting sunny summer daytime energising",
    "aquatic": "fresh clean marine airy breezy summer beach light",
    "green": "fresh crisp natural leafy spring outdoors light",
    "aromatic": "herbal fresh clean crisp daytime office versatile",
    "floral": "romantic feminine soft blooming spring elegant",
    "white floral": "romantic lush creamy heady elegant evening",
    "chypre": "sophisticated mossy elegant classic office evening",
    "woody": "warm grounded calm elegant autumn evening",
    "woody oriental": "warm rich sensual deep evening winter mysterious",
    "amber": "warm cosy sweet resinous winter evening sensual",
    "gourmand": "sweet cosy edible warm vanilla winter comforting",
    "leather": "bold smoky refined evening confident",
}

MOODS: dict[str, Profile] = {
    "fresh": _p(
        "Fresh & energising",
        "fresh clean bright zesty uplifting",
        "citrus, aquatic, green, aromatic",
        "bergamot, lemon, grapefruit, yuzu, mandarin, neroli, sea salt, fig leaf",
    ),
    "romantic": _p(
        "Romantic & soft",
        "romantic soft floral delicate tender",
        "floral, white floral",
        "rose, jasmine, peony, iris, violet, orange blossom, tuberose",
    ),
    "cozy": _p(
        "Warm & cosy",
        "warm cosy sweet comforting soft",
        "gourmand, amber, woody oriental",
        "vanilla, tonka bean, sandalwood, amber",
    ),
    "bold": _p(
        "Bold & confident",
        "bold intense rich smoky statement",
        "woody oriental, leather, amber",
        "oud, patchouli, leather, vetiver",
    ),
    "clean": _p(
        "Clean & minimal",
        "clean airy subtle fresh skin",
        "aromatic, aquatic, green",
        "lavender, sage, rosemary, sea salt, iris",
    ),
    "mysterious": _p(
        "Dark & mysterious",
        "mysterious deep sensual resinous dark",
        "woody oriental, chypre, woody",
        "oud, patchouli, oakmoss, vetiver, cedar",
    ),
}

OCCASIONS: dict[str, Profile] = {
    "everyday": _p("Everyday", "everyday versatile easy daytime", "citrus, aromatic, green"),
    "office": _p("Work", "office clean subtle professional daytime", "aromatic, citrus, chypre"),
    "date": _p("Date night", "date night sensual romantic evening", "floral, white floral, amber"),
    "evening": _p("Evening out", "evening party night intense", "woody oriental, amber, leather"),
    "special": _p(
        "Special occasion", "special elegant memorable celebration", "chypre, white floral"
    ),
}

SEASONS: dict[str, Profile] = {
    "spring": _p("Spring", "spring fresh floral green", "floral, green"),
    "summer": _p("Summer", "summer hot fresh light bright", "citrus, aquatic"),
    "autumn": _p("Autumn", "autumn warm woody spicy", "woody, chypre"),
    "winter": _p("Winter", "winter warm rich cosy", "amber, gourmand, woody oriental"),
    "all": _p("All year", "versatile all year", ""),
}


def family_hint(name: str | None) -> str:
    return FAMILY_HINTS.get((name or "").strip().lower(), "")
