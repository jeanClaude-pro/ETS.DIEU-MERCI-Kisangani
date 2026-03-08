const categories = [
  {
    id: "1",
    name: "Electronics",
    description: "Electronic devices and accessories",
  },
  { id: "2", name: "Clothing", description: "Apparel and fashion items" },
  { id: "3", name: "Food & Beverages", description: "Food items and drinks" },
  {
    id: "4",
    name: "Homets & Outdoors",
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
  },
];

const serverUrl = import.meta.env.VITE_API_URL;

async function main() {
  try {
    const response = await fetch(`${serverUrl}/categories`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: JSON.stringify(categories),
    });
    const data = await response.json();
    console.log("Categories:", data);
    console.log("Seeded categories successfully.");
  } catch (error) {
    console.error("Error fetching categories:", error);
  }
}

main();
