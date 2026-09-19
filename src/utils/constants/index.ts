import type { Category, Region, RegionCode } from "../../types";

export const getProductStatus = (status: string) => {
    switch (status) {
        case 'active':
            return 'Active';
        case 'inactive':
            return 'Inactive';
        default:
            return 'Unknown';
    }
}

export const categories: Category[] = [
    
   /*  { id: "2", name: "Clothing", description: "Apparel and fashion items" },
    { id: "3", name: "Food & Beverages", description: "Food items and drinks" },
    {
        id: "4",
        name: "Homet{
        id: "1",
        name: "Electronics",
        description: "Electronic devices and accessories",
    },s & Outdoors",
        description: "Sports equipment and outdoor gear",
    },
    {
        id: "6",
        name: "Books & Media",
        description: "Books, movies, and media content",
    },
    {
        id: "7",
        name: "Hea & Garden",
        description: "Home improvement and garden supplies",
    },
    {
        id: "5",
        name: "Sporlth & Beauty",
        description: "Health and beauty products",
    },
    {
        id: "8",
        name: "Automotive",
        description: "Car parts and automotive supplies",
    }, */
];

export const units = [
    "pcs",
    "kg",
    "lbs",
    "liters",
    "gallons",
    "meters",
    "feet",
    "boxes",
    "packs",
];

export const serverUrl = (import.meta as ImportMeta & { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL || "";

export const REGIONS: { region: Region; regionCode: RegionCode }[] = [
    { region: "Butembo", regionCode: "Bbbb" },
    { region: "China", regionCode: "Cnnn" },
];

export const REGION_CODE_MAP: Record<Region, RegionCode> = {
    Butembo: "Bbbb",
    China: "Cnnn",
};

export function formatProductLabel(product: { name: string; regionCode?: RegionCode | string }) {
    return product.regionCode ? `${product.name} (${product.regionCode})` : product.name;
}

// The single permanent system customer used whenever a sale has no registered
// customer attached. Mirrors the backend constant in server/utils/walkInCustomer.js.
export const WALKIN_CUSTOMER_NAME = "Walk-in Customer";
