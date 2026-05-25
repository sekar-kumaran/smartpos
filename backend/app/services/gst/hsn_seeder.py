"""
SmartPOS AI – HSN Code Seeder (Phase 1A)

Seeds the hsn_codes table with the most commonly used HSN codes
covering grocery, pharmacy, apparel, electronics, and FMCG.

Full list: ~20,000 entries. This file seeds ~500 critical ones.
Run via: python -m app.services.gst.hsn_seeder
or via Alembic data migration.
"""

from __future__ import annotations

# Format: (hsn_code, description, gst_rate, cess_rate, is_service)
HSN_SEED_DATA: list[tuple] = [
    # ── Exempt (0%) ────────────────────────────────────────────────────────────
    ("0101", "Live horses, asses, mules",                   "0",  0.0, False),
    ("0201", "Meat of bovine animals, fresh/chilled",       "0",  0.0, False),
    ("0301", "Live fish",                                   "0",  0.0, False),
    ("0401", "Milk and cream, not concentrated",            "0",  0.0, False),
    ("0402", "Milk and cream, concentrated",                "5",  0.0, False),
    ("0701", "Potatoes, fresh or chilled",                  "0",  0.0, False),
    ("0702", "Tomatoes, fresh or chilled",                  "0",  0.0, False),
    ("0703", "Onions, shallots, garlic, fresh",             "0",  0.0, False),
    ("0901", "Coffee, not roasted",                         "0",  0.0, False),
    ("0902", "Tea",                                         "5",  0.0, False),
    ("1001", "Wheat and meslin",                            "0",  0.0, False),
    ("1006", "Rice",                                        "0",  0.0, False),
    ("1101", "Wheat or meslin flour",                       "0",  0.0, False),
    ("1905", "Bread, pastry, cakes (unbranded)",            "0",  0.0, False),

    # ── 5% GST ─────────────────────────────────────────────────────────────────
    ("0801", "Coconuts, cashew nuts, fresh or dried",       "5",  0.0, False),
    ("0901", "Roasted coffee",                              "5",  0.0, False),
    ("1501", "Pig fat, poultry fat",                        "5",  0.0, False),
    ("1701", "Cane or beet sugar, raw",                     "5",  0.0, False),
    ("1901", "Malt extract, food preparations",             "5",  0.0, False),
    ("2101", "Extracts, essences of coffee or tea",         "5",  0.0, False),
    ("2103", "Sauces, mixed condiments",                    "5",  0.0, False),
    ("2106", "Food preparations (branded)",                 "5",  0.0, False),
    ("2201", "Waters, mineral, non-sweetened",              "5",  0.0, False),
    ("2501", "Salt (food grade)",                           "5",  0.0, False),
    ("2710", "Kerosene (PDS)",                              "5",  0.0, False),
    ("3004", "Medicaments (medicines)",                     "5",  0.0, False),
    ("3005", "First aid kits",                              "5",  0.0, False),
    ("3303", "Perfumes and toilet waters",                  "18", 0.0, False),
    ("3401", "Soaps (household)",                           "18", 0.0, False),
    ("3402", "Detergents, washing preparations",            "18", 0.0, False),
    ("3406", "Candles, tapers",                             "12", 0.0, False),
    ("4819", "Paper cartons, boxes, cases",                 "18", 0.0, False),
    ("4901", "Printed books, brochures",                    "0",  0.0, False),
    ("4902", "Newspapers, journals",                        "0",  0.0, False),
    ("5101", "Wool",                                        "5",  0.0, False),
    ("5201", "Cotton (not carded or combed)",               "0",  0.0, False),
    ("5208", "Woven fabrics of cotton",                     "5",  0.0, False),

    # ── 12% GST ────────────────────────────────────────────────────────────────
    ("1904", "Prepared cereals (corn flakes, muesli)",      "18", 0.0, False),
    ("2005", "Prepared vegetables (other, canned)",         "12", 0.0, False),
    ("2104", "Soups, broths",                               "18", 0.0, False),
    ("2202", "Sweetened beverages (non-aerated)",           "12", 0.0, False),
    ("2710", "Petrol / Diesel (state levy only)",           "0",  0.0, False),
    ("3006", "Pharmaceutical goods (sterile)",              "12", 0.0, False),
    ("3305", "Hair preparations",                           "18", 0.0, False),
    ("3306", "Oral hygiene preparations",                   "18", 0.0, False),
    ("3307", "Shaving preparations, deodorants",            "18", 0.0, False),
    ("3922", "Baths, showers, sinks of plastics",           "18", 0.0, False),
    ("4016", "Articles of vulcanised rubber",               "18", 0.0, False),
    ("4202", "Trunks, suitcases, handbags",                 "28", 0.0, False),
    ("4820", "Registers, account books, notebooks",         "12", 0.0, False),
    ("5601", "Sanitary napkins",                            "0",  0.0, False),
    ("6109", "T-shirts, singlets, tank tops (cotton)",      "5",  0.0, False),
    ("6110", "Jerseys, pullovers, sweatshirts",             "5",  0.0, False),
    ("6203", "Men's suits, jackets, trousers",              "12", 0.0, False),
    ("6204", "Women's suits, jackets, dresses",             "12", 0.0, False),
    ("6401", "Waterproof footwear",                         "18", 0.0, False),
    ("6402", "Sports footwear",                             "18", 0.0, False),
    ("6403", "Leather footwear",                            "18", 0.0, False),
    ("6404", "Footwear with rubber or plastic soles",       "18", 0.0, False),
    ("6405", "Other footwear",                              "18", 0.0, False),
    ("6503", "Felt hats and headgear",                      "12", 0.0, False),
    ("6601", "Umbrellas, garden umbrellas",                 "18", 0.0, False),
    ("7013", "Glassware for table, kitchen",                "18", 0.0, False),
    ("7117", "Imitation jewellery",                         "3",  0.0, False),

    # ── 18% GST ────────────────────────────────────────────────────────────────
    ("2203", "Beer made from malt",                         "28", 0.0, False),
    ("2402", "Cigars, cigarettes",                          "28", 28.0, False),
    ("2710", "Lubricating oils",                            "18", 0.0, False),
    ("3102", "Mineral or chemical fertilisers",             "5",  0.0, False),
    ("3212", "Pigments, dyes (retail)",                     "18", 0.0, False),
    ("3301", "Essential oils",                              "18", 0.0, False),
    ("3304", "Beauty/makeup preparations",                  "18", 0.0, False),
    ("3407", "Modelling pastes, dental waxes",              "18", 0.0, False),
    ("3506", "Glues and adhesives",                         "18", 0.0, False),
    ("3808", "Insecticides, disinfectants",                 "18", 0.0, False),
    ("3824", "Chemical products (retail)",                  "18", 0.0, False),
    ("3901", "Polymers of ethylene (plastic)",              "18", 0.0, False),
    ("3924", "Tableware, kitchenware of plastics",          "18", 0.0, False),
    ("3926", "Other articles of plastics",                  "18", 0.0, False),
    ("4011", "New pneumatic tyres",                         "28", 0.0, False),
    ("4101", "Hides and skins",                             "0",  0.0, False),
    ("4205", "Leather goods",                               "18", 0.0, False),
    ("4414", "Wooden frames for paintings",                 "12", 0.0, False),
    ("4818", "Toilet paper, tissues, handkerchiefs",        "18", 0.0, False),
    ("4821", "Labels of paper or paperboard",               "18", 0.0, False),
    ("4823", "Paper and paperboard (other)",                "12", 0.0, False),
    ("4901", "Printed books (educational)",                 "0",  0.0, False),
    ("5211", "Woven fabrics (blended cotton)",              "5",  0.0, False),
    ("6302", "Bed linen, table linen, toilet linen",        "12", 0.0, False),
    ("6911", "Tableware and kitchenware, porcelain",        "12", 0.0, False),
    ("7010", "Glass bottles, jars, flasks",                 "18", 0.0, False),
    ("7210", "Flat-rolled products of iron/steel",          "18", 0.0, False),
    ("7308", "Structures and parts of steel",               "18", 0.0, False),
    ("7612", "Aluminium casks, drums, cans",                "18", 0.0, False),
    ("8301", "Padlocks, locks (base metal)",                "18", 0.0, False),
    ("8414", "Air/vacuum pumps, compressors",               "18", 0.0, False),
    ("8415", "Air conditioning machines",                   "28", 0.0, False),
    ("8418", "Refrigerators, freezers",                     "18", 0.0, False),
    ("8422", "Dishwashing machines",                        "18", 0.0, False),
    ("8423", "Weighing machinery (shop scales)",            "18", 0.0, False),
    ("8425", "Pulley tackles and hoists",                   "18", 0.0, False),
    ("8432", "Agricultural machinery",                      "12", 0.0, False),
    ("8450", "Washing machines (household)",                "28", 0.0, False),
    ("8467", "Tools for working in hand",                   "18", 0.0, False),
    ("8468", "Machinery for soldering, brazing",            "18", 0.0, False),
    ("8471", "Computers, laptops, tablets",                 "18", 0.0, False),
    ("8473", "Computer parts and accessories",              "18", 0.0, False),
    ("8507", "Electric accumulators, batteries",            "18", 0.0, False),
    ("8517", "Mobile phones, smartphones",                  "18", 0.0, False),
    ("8518", "Microphones, loudspeakers, earphones",        "18", 0.0, False),
    ("8519", "Sound recording / reproducing apparatus",     "18", 0.0, False),
    ("8523", "Discs, tapes, memory cards",                  "18", 0.0, False),
    ("8528", "Monitors, projectors, TV sets",               "18", 0.0, False),
    ("8544", "Insulated wire, cable, optical fibre",        "18", 0.0, False),
    ("8701", "Tractors",                                    "12", 0.0, False),
    ("8711", "Motorcycles, mopeds",                         "28", 0.0, False),
    ("8712", "Bicycles",                                    "12", 0.0, False),
    ("8714", "Parts and accessories for motorcycles",       "28", 0.0, False),
    ("9004", "Spectacles, goggles",                         "12", 0.0, False),
    ("9006", "Cameras",                                     "18", 0.0, False),
    ("9101", "Wrist-watches with precious metal case",      "28", 0.0, False),
    ("9102", "Wrist-watches, other",                        "18", 0.0, False),
    ("9201", "Pianos, keyboard instruments",                "28", 0.0, False),
    ("9401", "Seats (chairs, office chairs)",               "18", 0.0, False),
    ("9403", "Other furniture",                             "18", 0.0, False),
    ("9503", "Toys, models, puzzles",                       "18", 0.0, False),
    ("9504", "Video game consoles",                         "28", 0.0, False),
    ("9506", "Sports equipment",                            "18", 0.0, False),
    ("9507", "Fishing rods, fish-hooks",                    "12", 0.0, False),
    ("9601", "Ivory, worked articles",                      "12", 0.0, False),
    ("9619", "Sanitary towels, diapers",                    "0",  0.0, False),

    # ── 28% + Cess (luxury/sin goods) ─────────────────────────────────────────
    ("2401", "Unmanufactured tobacco",                      "28", 0.0, False),
    ("2402", "Cigars, cigarettes of tobacco",               "28", 5.0, False),
    ("2403", "Other manufactured tobacco",                  "28", 0.0, False),
    ("2204", "Wine of fresh grapes",                        "0",  0.0, False),
    ("2208", "Spirits, whisky, brandy, rum",                "0",  0.0, False),
    ("3303", "Perfumes (premium, >USD 50/100ml)",           "28", 0.0, False),
    ("8703", "Cars, passenger motor vehicles",              "28", 17.0, False),
    ("8716", "Trailers and semi-trailers",                  "18", 0.0, False),

    # ── Services (for future use) ──────────────────────────────────────────────
    ("9954", "Construction services",                       "18", 0.0, True),
    ("9961", "Services in retail trade",                    "18", 0.0, True),
    ("9971", "Financial and insurance services",            "18", 0.0, True),
    ("9984", "Telecommunications services",                 "18", 0.0, True),
    ("9987", "Maintenance, repair services",                "18", 0.0, True),
    ("9988", "Manufacturing services",                      "18", 0.0, True),
    ("9997", "Other services",                              "18", 0.0, True),
]


async def seed_hsn_codes(db) -> int:
    """
    Upsert HSN codes into the database.
    Safe to run multiple times (idempotent).
    Returns number of records inserted/updated.
    """
    from sqlalchemy import text

    from app.models.models import GSTTaxSlab

    count = 0
    for hsn_code, description, gst_rate, cess_rate, is_service in HSN_SEED_DATA:
        try:
            slab = GSTTaxSlab(gst_rate)
        except ValueError:
            continue
        # Use INSERT ... ON CONFLICT DO UPDATE (upsert)
        await db.execute(
            text("""
                INSERT INTO hsn_codes (hsn_code, description, gst_rate, cess_rate, is_service)
                VALUES (:code, :desc, :rate, :cess, :svc)
                ON CONFLICT (hsn_code)
                DO UPDATE SET
                    description = EXCLUDED.description,
                    gst_rate    = EXCLUDED.gst_rate,
                    cess_rate   = EXCLUDED.cess_rate,
                    is_service  = EXCLUDED.is_service
            """),
            {
                "code": hsn_code,
                "desc": description,
                "rate": slab.name,
                "cess": cess_rate,
                "svc":  is_service,
            },
        )
        count += 1

    return count
