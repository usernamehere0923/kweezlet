import { useState } from "react";
import { useT } from "../../i18n";
import {
  Button,
  Card,
  Checkbox,
  DevRibbon,
  EmptyState,
  FormError,
  Heading,
  IconButton,
  Modal,
  PageLoading,
  SearchField,
  SegmentedControl,
  Select,
  Spinner,
  Tag,
  Text,
  TextField,
  useToast,
} from "../../ui";
import { Chapter, Section } from "./layout";

export function Controls() {
  const { t } = useT();
  const toast = useToast();
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [query, setQuery] = useState("");
  const [lang, setLang] = useState<"es" | "fr" | "it">("es");
  const [view, setView] = useState<"cards" | "list">("cards");
  const [shuffle, setShuffle] = useState(true);
  const [modal, setModal] = useState(false);

  return (
    <>
      <Chapter title={t("design.buttons")}>
        <Section
          title="Button · ButtonLink · IconButton"
          code={`<Button onClick={save}>Save</Button>                 // the ONE main action
<Button variant="secondary" icon="plus">Add</Button>
<Button variant="ghost">Cancel</Button>
<Button variant="danger" icon="trash">Delete</Button>
<Button loading={busy}>Saving</Button>   <Button size="sm">Small</Button>
<ButtonLink to="/settings">Go somewhere</ButtonLink>
<IconButton icon="edit" label="Edit" />`}
        >
          <div className="flex flex-wrap items-center gap-3">
            <Button>Primary</Button>
            <Button variant="secondary" icon="plus">
              Secondary
            </Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger" icon="trash">
              Danger
            </Button>
            <Button loading>Loading</Button>
            <Button disabled>Disabled</Button>
            <Button size="sm" variant="secondary">
              Small
            </Button>
            <Button size="lg">Large</Button>
            <IconButton icon="edit" label="Edit" />
            <IconButton icon="star" label="Favourite" variant="secondary" />
          </div>
        </Section>
      </Chapter>

      <Chapter title={t("design.fields")}>
        <Section
          title="TextField · SearchField · FormError"
          code={`<TextField label="Set title" value={title} onChange={setTitle} hint="Shown in your library" />
<TextField label="Description" multiline value={d} onChange={setD} />
<TextField label="Title" value={v} onChange={setV} error="Too short" />
<SearchField label="Search" clearLabel="Clear" value={q} onChange={setQ} />
<FormError>Fill in both fields of a term, or delete the row.</FormError>`}
        >
          <div className="grid gap-5 md:grid-cols-2">
            <TextField
              label="Set title"
              value={name}
              onChange={setName}
              placeholder="e.g. Spanish animals"
              hint="Shown in your library"
            />
            <TextField label="With an error" value="ab" onChange={() => {}} error="Too short" />
            <TextField
              label="Description"
              multiline
              value={notes}
              onChange={setNotes}
              placeholder="What is this set about?"
            />
            <div className="flex flex-col gap-5">
              <SearchField
                label={t("search.placeholder")}
                clearLabel={t("common.clear")}
                value={query}
                onChange={setQuery}
              />
              <TextField label="Disabled" value="Can't touch this" onChange={() => {}} disabled />
            </div>
          </div>
          <FormError className="mt-5">Fill in both fields of a term, or delete the row.</FormError>
        </Section>
      </Chapter>

      <Chapter title={t("design.choices")}>
        <Section
          title="Select · SegmentedControl · Checkbox"
          code={`<Select label="Language" value={lang} onChange={setLang}
  options={[{ value: "es", label: "Spanish" }, { value: "fr", label: "French" }]} />
<SegmentedControl label="View" value={view} onChange={setView}
  options={[{ value: "cards", label: "Cards" }, { value: "list", label: "List" }]} />
<Checkbox label="Shuffle cards" checked={shuffle} onChange={setShuffle} />`}
        >
          <div className="grid items-start gap-5 md:grid-cols-3">
            <Select
              label="Language"
              value={lang}
              onChange={setLang}
              options={[
                { value: "es", label: "Spanish" },
                { value: "fr", label: "French" },
                { value: "it", label: "Italian" },
              ]}
            />
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-soft">View</span>
              <SegmentedControl
                label="View"
                value={view}
                onChange={setView}
                options={[
                  { value: "cards", label: "Cards" },
                  { value: "list", label: "List" },
                ]}
              />
            </div>
            <div className="pt-7">
              <Checkbox label="Shuffle cards" hint="Random order every round" checked={shuffle} onChange={setShuffle} />
            </div>
          </div>
        </Section>
      </Chapter>

      <Chapter title={t("design.layout")}>
        <Section
          title="Card · Tag · EmptyState"
          code={`<Card>Anything</Card>   <Card onClick={open}>Clickable</Card>
<Tag>Spanish</Tag>   <Tag tone="accent">New</Tag>   <Tag tone="correct" icon="check">Done</Tag>
<EmptyState icon="folder" title="No sets yet" text="Create your first set." action={<Button>Create</Button>} />`}
        >
          <div className="grid gap-5 md:grid-cols-2">
            <Card>
              <Heading level={3}>A card</Heading>
              <Text variant="muted" className="mt-1">
                The surface everything sits on.
              </Text>
              <div className="mt-4 flex flex-wrap gap-2">
                <Tag>Spanish</Tag>
                <Tag tone="accent">New</Tag>
                <Tag tone="neutral">Draft</Tag>
                <Tag tone="correct" icon="check">
                  Learned
                </Tag>
                <Tag tone="wrong">Hard</Tag>
              </div>
            </Card>
            <EmptyState
              icon="folderPlus"
              title="No sets yet"
              text="Create your first set."
              action={<Button icon="plus">Create</Button>}
            />
          </div>
        </Section>
        <Section
          title="DevRibbon"
          code={`{import.meta.env.DEV && <DevRibbon />}   // App.tsx: top-right corner, local dev server only
<DevRibbon contained />                    // inside a "relative" box, like here`}
        >
          <Card className="relative h-48 overflow-hidden">
            <Text variant="muted">The local dev server shows this in the top-right corner.</Text>
            <DevRibbon contained />
          </Card>
        </Section>
      </Chapter>

      <Chapter title={t("design.feedback")}>
        <Section
          title="useToast · Modal · Spinner · PageLoading"
          code={`const toast = useToast();
toast(t("common.saved"), "success");        // "info" | "success" | "error"

<Modal open={open} onClose={() => setOpen(false)} title="Delete this set?"
  actions={<><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="danger">Delete</Button></>}>
  This cannot be undone.
</Modal>
<Spinner />
if (!data) return <PageLoading />;   // whole page loading
<PageLoading fullScreen />           // the app's first load, before any page`}
        >
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={() => toast(t("design.toastText"), "info")}>
              {t("design.showToast")}
            </Button>
            <Button variant="secondary" onClick={() => toast(t("common.saved"), "success")}>
              Success toast
            </Button>
            <Button variant="secondary" onClick={() => toast(t("errors.server"), "error")}>
              Error toast
            </Button>
            <Button variant="ghost" onClick={() => setModal(true)}>
              {t("design.openModal")}
            </Button>
            <Spinner className="text-accent" />
          </div>
          <PageLoading />
          <Modal
            open={modal}
            onClose={() => setModal(false)}
            title={t("sets.deleteTitle")}
            actions={
              <>
                <Button variant="ghost" onClick={() => setModal(false)}>
                  {t("common.cancel")}
                </Button>
                <Button variant="danger" icon="trash" onClick={() => setModal(false)}>
                  {t("common.delete")}
                </Button>
              </>
            }
          >
            {t("sets.deleteText")}
          </Modal>
        </Section>
      </Chapter>
    </>
  );
}
