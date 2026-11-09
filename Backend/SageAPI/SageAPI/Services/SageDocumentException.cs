namespace SageAPI.Services
{
    /// <summary>
    /// A Sage document (quotation, order, invoice) failed while being built or saved.
    /// Message reads like "Line 2: item 'ABC' in warehouse '2' → Object reference not set ... (NullReferenceException)".
    /// </summary>
    public class SageDocumentException : Exception
    {
        /// <summary>The step that failed, e.g. "Line 2: item 'ABC' in warehouse '2'".</summary>
        public string Step { get; }

        /// <summary>Sage's own messages, outermost first, including inner exceptions.</summary>
        public List<string> Reasons { get; }

        public SageDocumentException(string step, Exception inner)
            : base($"{step} → {Describe(inner)}", inner)
        {
            Step = step;
            Reasons = new List<string>();
            for (Exception? e = inner; e != null; e = e.InnerException)
                Reasons.Add(Describe(e));
        }

        private static string Describe(Exception e) => $"{e.Message} ({e.GetType().Name})";

        /// <summary>Where in the Sage SDK it broke: the top few lines of the stack trace.</summary>
        public string? SageLocation =>
            InnerException?.StackTrace?
                .Split('\n')
                .Select(l => l.Trim())
                .Where(l => l.Length > 0)
                .Take(4)
                .Aggregate((a, b) => a + " | " + b);
    }
}
