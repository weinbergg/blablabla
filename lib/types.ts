export type Category = {
  id: string;
  slug: string;
  name: string;
  description: string;
  accent: string;
  index: string;
};

export type Subcategory = {
  id: string;
  categoryId: string;
  name: string;
};

export type LibraryDocument = {
  id: string;
  title: string;
  author: string;
  year?: string;
  description?: string;
  categoryId: string;
  subcategoryId: string;
  fileUrl?: string;
  fileName?: string;
  fileType: string;
  pages?: number;
  featured?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type LibraryData = {
  categories: Category[];
  subcategories: Subcategory[];
  documents: LibraryDocument[];
};
