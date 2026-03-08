import type { Category } from "../../types";

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

export const serverUrl = import.meta.env.VITE_API_URL;