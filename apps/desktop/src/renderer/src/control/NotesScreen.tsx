import { PATCH_NOTES } from '../../../shared/patch-notes';

export const NotesScreen = ({ version }: { version: string }) => (
  <section className="glass panel notes" aria-labelledby="notes-title">
    <h2 id="notes-title" className="panel-title">
      Toutes les versions
      <span className="count">
        Tu as la version <span className="mono">{version}</span>
      </span>
    </h2>
    <ol className="notes-list scroll">
      {PATCH_NOTES.map((note) => (
        <li key={note.version} className="notes-entry" data-testid="patch-note">
          <h3>
            <span className="mono">{note.version}</span>
            <span className="row-sub">{note.date}</span>
          </h3>
          <ul>
            {note.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  </section>
);
