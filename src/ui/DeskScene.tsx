/**
 * Original line art for the field-office metaphor. The scene is deliberately
 * simple and icon-like so it reads as interface chrome, not decorative stock art.
 */
export function DeskScene() {
  return (
    <figure className="desk-scene" role="img" aria-label="A construction draw desk with an inbox, field plans, and approval stamp">
      <svg viewBox="0 0 520 250" role="img" aria-hidden="true">
        <defs>
          <pattern id="desk-dots" width="7" height="7" patternUnits="userSpaceOnUse">
            <circle cx="1.3" cy="1.3" r="1" />
          </pattern>
        </defs>

        <path className="desk-scene__sky" d="M18 25h484v151H18z" />
        <path className="desk-scene__sun" d="M432 44a22 22 0 1 1-.1 0" />
        <path className="desk-scene__crane" d="M55 154V52m-17 102h38M47 52h174m-124 0 48 32m76-32v20m-12 0h24" />
        <path className="desk-scene__site" d="M25 161l61-55 44 31 54-54 54 78m-186-24 35-27 27 19" />

        <path className="desk-scene__desk" d="M7 173h506v24H7z" />
        <path className="desk-scene__legs" d="M42 197v44m432-44v44" />

        <g className="desk-scene__tray">
          <path d="M48 135h126l12 38H36z" />
          <path d="M58 126h102l5 10H53z" />
          <path d="M66 118h86l4 9H62z" />
          <path className="desk-scene__paper" d="M72 99h74l3 20H68z" />
          <text x="82" y="113">IN: 10 DRAWS</text>
        </g>

        <g className="desk-scene__plans" transform="rotate(-4 280 142)">
          <path className="desk-scene__paper" d="M205 105h151v68H205z" />
          <path d="M218 158h67v-35h50v35m-93-35v35m65-35v35" />
          <path d="M215 115h128" />
          <circle cx="334" cy="115" r="10" />
        </g>

        <g className="desk-scene__stamp">
          <path d="M394 110h66v18h-66z" />
          <path d="M409 110c0-19 8-30 18-30s18 11 18 30" />
          <path className="desk-scene__stamp-base" d="M382 128h90l9 45H373z" />
          <text x="397" y="155">FUND</text>
        </g>
      </svg>

      <figcaption>
        <span>In tray</span>
        <span>Field plans</span>
        <span>Decision stamp</span>
      </figcaption>
    </figure>
  );
}
