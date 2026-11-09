namespace SageAPI.Models
{
    /// <summary>A store category (OnlineStore.dbo.StoreCategory). Categories are one flat list; each item is in one category.</summary>
    public class StoreCategoryDto
    {
        public int CategoryId { get; set; }
        public string Name { get; set; } = "";
        public bool IsVisible { get; set; }
        public int ItemCount { get; set; }
    }

    public class CategoryCreateInput
    {
        public string Name { get; set; } = "";
    }

    public class CategoryUpdateInput
    {
        public string Name { get; set; } = "";
        public bool IsVisible { get; set; } = true;
    }

    /// <summary>An active Sage item with its store category. CategoryId null = shown under "Other".</summary>
    public class StoreItemDto
    {
        public int StockLink { get; set; }
        public string ItemCode { get; set; } = "";
        public string Description { get; set; } = "";
        public string? SageGroup { get; set; }
        public int? CategoryId { get; set; }
        public bool IsVisible { get; set; } = true;
    }

    /// <summary>Changes several items at once. Only the parts that are set are changed.</summary>
    public class ItemsUpdateInput
    {
        public List<int> StockLinks { get; set; } = new();
        /// <summary>true to change the category to CategoryId (null = no category / "Other").</summary>
        public bool SetCategory { get; set; }
        public int? CategoryId { get; set; }
        public bool? IsVisible { get; set; }
    }

    /// <summary>One row from an uploaded Excel/CSV file. Row is the spreadsheet row number, for messages.</summary>
    public class CategoryImportRow
    {
        public int Row { get; set; }
        public string? ItemCode { get; set; }
        public string? Category { get; set; }
        public string? Show { get; set; }
    }

    public class CategoryImportInput
    {
        public List<CategoryImportRow> Rows { get; set; } = new();
    }

    public class CategoryImportResult
    {
        public bool Applied { get; set; }
        public int RowsRead { get; set; }
        public int ItemsMatched { get; set; }
        public int CategoryChanges { get; set; }
        public int VisibilityChanges { get; set; }
        public int Unchanged { get; set; }
        /// <summary>Category names the file creates.</summary>
        public List<string> NewCategories { get; set; } = new();
        public List<CategoryImportError> Errors { get; set; } = new();
    }

    public class CategoryImportError
    {
        public int Row { get; set; }
        public string Message { get; set; } = "";
    }
}
