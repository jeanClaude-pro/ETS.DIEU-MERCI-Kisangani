export type Region = "Butembo" | "China";
export type RegionCode = "Bbbb" | "Cnnn";
/** RegionCode plus "" to represent an unset "all regions" filter selection. */
export type RegionCodeFilter = "" | RegionCode;

export interface Product {
  _id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  brand: string;
  stock: number;
  minStock: number;
  unit: string;
  weight: number;
  unitCost?: number;
  status: "active" | "inactive";
  region: Region;
  regionCode: RegionCode;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  _id: string;
  name: string;
  description: string;
}
