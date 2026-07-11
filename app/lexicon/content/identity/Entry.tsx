//app/lexicon/content/identity/Entry.tsx

import BookQuote from "@/components/docs/BookQuote";
import Identity from "@/components/essays/Identity";

const sectionTitleClass =
    "text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200/60";

const paragraphClass =
    "space-y-6 text-[17px] leading-9 text-white/75";

export default function Entry() {
    return (
        <div className="space-y-14">

            {/* Definition */}

            <section>
                <p className={sectionTitleClass}>
                    Definition
                </p>

                <div className={`mt-6 ${paragraphClass}`}>

                    <p>
                        Identity is the persistent context through which a person's
                        actions, contributions, relationships, recognition, and
                        participation can be understood across time.
                    </p>

                    <p>
                        It connects otherwise fragmented interactions without reducing
                        the person to any single wallet, account, credential, record,
                        or score.
                    </p>

                    <p>
                        Identity does not replace identifiers.
                    </p>

                    <p>
                        It provides the continuity through which identifiers, actions,
                        and records become part of an ongoing participant history rather
                        than isolated events.
                    </p>

                </div>
            </section>

            <BookQuote>
                Identity is not a record. It is the continuity that gives records meaning.
            </BookQuote>

            {/* Why Identity */}

            <section>

                <p className={sectionTitleClass}>
                    Why Identity?
                </p>

                <div className={`mt-6 ${paragraphClass}`}>

                    <p>
                        Human participation unfolds over time.
                    </p>

                    <p>
                        People learn, collaborate, contribute, solve problems, build
                        relationships, and create value across many different moments,
                        environments, and forms of interaction.
                    </p>

                    <p>
                        Without a persistent context, these contributions become
                        fragmented into disconnected records that reveal little about
                        the broader story of participation.
                    </p>

                    <p>
                        Identity provides that continuity.
                    </p>

                    <p>
                        It allows meaningful contribution to be understood not only as
                        isolated actions, but as part of an evolving history that
                        connects people with their participation over time.
                    </p>

                </div>

            </section>

            {/* Identity vs Identifier */}

            <section>

                <p className={sectionTitleClass}>
                    Identity and Identifiers
                </p>

                <div className={`mt-6 ${paragraphClass}`}>

                    <p>
                        An identity should not be confused with the identifiers through
                        which it is represented.
                    </p>

                    <p>
                        Wallets, accounts, usernames, credentials, addresses, and
                        documents all function as identifiers.
                    </p>

                    <p>
                        They help distinguish or authenticate a participant within
                        particular systems, but none of them alone constitute identity
                        itself.
                    </p>

                    <p>
                        Identity provides the persistent context that allows these
                        identifiers to be understood as belonging to the same
                        participant across changing circumstances.
                    </p>

                    <p>
                        As technologies evolve, identifiers may change while identity
                        remains continuous.
                    </p>

                </div>

            </section>

            {/* Across Time */}

            <section>

                <p className={sectionTitleClass}>
                    Identity Across Time
                </p>

                <div className={`mt-6 ${paragraphClass}`}>

                    <p>
                        Meaningful participation is rarely defined by a single moment.
                    </p>

                    <p>
                        Contributions accumulate through learning, experience,
                        collaboration, and long-term engagement.
                    </p>

                    <p>
                        Identity provides the continuity through which these experiences
                        may remain connected rather than becoming isolated records.
                    </p>

                    <p>
                        This continuity enables systems and communities to understand
                        contribution as an evolving process instead of disconnected
                        events.
                    </p>

                </div>

            </section>

            {/* Infographic */}

            <Identity />

            {/* Within Levershare */}

            <section>

                <p className={sectionTitleClass}>
                    Within Levershare
                </p>

                <div className={`mt-6 ${paragraphClass}`}>

                    <p>
                        Within Levershare, identity provides the persistent participant
                        context upon which contribution, recognition, and participation
                        can be understood over time.
                    </p>

                    <p>
                        Rather than treating each interaction as an isolated event,
                        identity enables contributions from different moments and
                        interaction points to remain connected within a continuing
                        participation history.
                    </p>

                    <p>
                        This continuity supports Proof of Value, Recognition,
                        Proof Ledger, CorePoints, and future forms of economic
                        participation without reducing identity to any single technical
                        identifier.
                    </p>

                </div>

            </section>

            <BookQuote>
                Participation becomes meaningful across time when contributions remain connected through identity.
            </BookQuote>

        </div>
    );
}