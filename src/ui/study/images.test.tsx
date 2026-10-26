import { fireEvent, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";
import { renderUi } from "../../test/render";
import { TermEditorRow, TermImage, TermImagePicker, TermList } from "..";
import { fileToDataUrl } from "../../lib/images";

// jsdom decodes no pictures: the shrinking itself is tested in src/lib/images.test.ts.
vi.mock("../../lib/images", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/images")>()),
  fileToDataUrl: vi.fn(async () => "data:image/png;base64,CAT"),
}));

const mockedFileToDataUrl = vi.mocked(fileToDataUrl);

/** The picker's hidden file input, with a picked file. */
function pick(picker: HTMLElement, file: File) {
  const input = picker.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

describe("TermImage", () => {
  test("shows the picture big on a card and small as a thumbnail", () => {
    const { rerender } = renderUi(<TermImage src="cat.png" alt="the cat" />);
    expect(screen.getByRole("img", { name: "the cat" }).className).toContain("rounded-ui-lg");
    rerender(<TermImage src="cat.png" alt="" variant="thumb" />);
    expect(screen.getByRole("presentation").className).toContain("size-12");
  });
});

describe("TermImagePicker", () => {
  test("no image yet: one Add button, picking a file hands its data URL over", async () => {
    const onChange = vi.fn();
    const { container } = renderUi(<TermImagePicker image={null} onChange={onChange} />);
    expect(screen.getByRole("button", { name: "Add image" })).toBeTruthy();
    expect(screen.queryByRole("presentation")).toBeNull();

    pick(container as HTMLElement, new File(["hello"], "cat.png", { type: "image/png" }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.stringMatching(/^data:image\/png;base64,/)));
  });

  test("a picture is there: thumbnail, Replace and Remove; Remove hands over null", () => {
    const onChange = vi.fn();
    renderUi(<TermImagePicker image="cat.png" onChange={onChange} />);
    expect(screen.getByRole("img", { name: "Image" }).getAttribute("src")).toBe("cat.png");
    expect(screen.getByRole("button", { name: "Replace image" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Remove image" }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  test("a file that is no picture shows the error and keeps the old image", async () => {
    mockedFileToDataUrl.mockRejectedValueOnce(new Error("image could not be read"));
    const onChange = vi.fn();
    const { container } = renderUi(<TermImagePicker image={null} onChange={onChange} />);

    pick(container as HTMLElement, new File(["%PDF"], "book.pdf", { type: "application/pdf" }));
    await waitFor(() => expect(screen.getByText(/could not be read|nicht gelesen/)).toBeTruthy());
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("the term editor and list", () => {
  test("TermEditorRow shows the image slot only when it has one", () => {
    const { rerender } = renderUi(
      <TermEditorRow
        index={0}
        term="el gato"
        definition="the cat"
        onChange={() => {}}
        image="cat.png"
        onImage={() => {}}
      />,
    );
    expect(screen.getByRole("img", { name: "Image" })).toBeTruthy();
    rerender(<TermEditorRow index={0} term="el gato" definition="the cat" onChange={() => {}} />);
    expect(screen.queryByRole("presentation")).toBeNull();
  });

  test("TermList shows a thumbnail where a term has an image", () => {
    renderUi(
      <TermList
        terms={[
          { term: "el gato", definition: "the cat", image: "cat.png" },
          { term: "el perro", definition: "the dog" },
        ]}
      />,
    );
    expect(screen.getByRole("presentation").getAttribute("src")).toBe("cat.png");
  });

  test("the picker works inside a controlled row", async () => {
    function Row() {
      const [image, setImage] = useState<string | null>(null);
      return (
        <TermEditorRow
          index={0}
          term="el gato"
          definition="the cat"
          onChange={() => {}}
          image={image}
          onImage={setImage}
        />
      );
    }
    const { container } = renderUi(<Row />);
    pick(container as HTMLElement, new File(["hello"], "cat.png", { type: "image/png" }));
    // The picked picture turns into the row's thumbnail.
    await waitFor(() =>
      expect(screen.getByRole("img", { name: "Image" }).getAttribute("src")).toMatch(/^data:image\/png;base64,/),
    );
  });
});
